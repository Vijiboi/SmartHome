#include "power_mgmt.h"

#include <stdbool.h>

#define POWER_MGMT_RTC_WAKEUP_SECONDS             (3600U)
#define POWER_MGMT_SENSOR_STABILISE_MS            (5U)
#define POWER_MGMT_RADIO_INRUSH_MS                (2U)
#define POWER_MGMT_RADIO_AIRTIME_MS               (1U)
#define POWER_MGMT_RADIO_SHUTDOWN_MS              (2U)
#define POWER_MGMT_PVD_STABILISE_LOOPS            (1200U)
#define POWER_MGMT_ISR_AIRTIME_LOOPS              (2100U)
#define POWER_MGMT_I2C_TIMEOUT_MS                 (10U)

/*
 * The I2C timing value below assumes the MSI clock is running at 2.097 MHz
 * and targets a conservative 100 kHz Standard-mode bus. In a CubeMX-generated
 * project, this is normally recalculated from the exact board clock tree.
 */
#define POWER_MGMT_I2C1_TIMING                    (0x00200809U)

/*
 * BME280 default 7-bit address is 0x76 when SDO is tied low.
 * If SDO is strapped high, this should be changed to 0x77.
 */
#define POWER_MGMT_BME280_I2C_ADDRESS             (0x76U << 1U)
#define POWER_MGMT_BME280_REG_CTRL_HUM            (0xF2U)
#define POWER_MGMT_BME280_REG_CTRL_MEAS           (0xF4U)
#define POWER_MGMT_BME280_REG_DATA_START          (0xF7U)

#define POWER_MGMT_TELEMETRY_FRAME_LENGTH         (6U)
#define POWER_MGMT_EMERGENCY_FRAME_LENGTH         (6U)

typedef struct
{
    uint32_t raw_temperature;
    uint16_t raw_humidity;
    uint8_t last_temperature_byte;
    uint8_t last_humidity_byte;
    uint32_t primask;
    uint8_t radio_tx_buffer[POWER_MGMT_TELEMETRY_FRAME_LENGTH];
    uint16_t uptime_hours;
    volatile uint8_t rtc_wakeup_pending;
} PowerMgmt_ContextTypeDef;

static RTC_HandleTypeDef hrtc;
static I2C_HandleTypeDef hi2c1;
static PowerMgmt_ContextTypeDef g_context;
static PowerMgmt_StateTypeDef g_state = POWER_MGMT_STATE_DEEP_SLEEP;

static void PowerMgmt_SystemClockConfig(void);
static HAL_StatusTypeDef PowerMgmt_SystemPowerConfig(void);
static HAL_StatusTypeDef PowerMgmt_RtcConfig(void);
static HAL_StatusTypeDef PowerMgmt_PvdConfig(void);
static void PowerMgmt_ConfigureDeepSleepGpio(void);
static HAL_StatusTypeDef PowerMgmt_InitI2c1(void);
static HAL_StatusTypeDef PowerMgmt_DeinitI2c1(void);
static HAL_StatusTypeDef PowerMgmt_Bme280EnterForcedMode(void);
static HAL_StatusTypeDef PowerMgmt_Bme280ReadRaw(PowerMgmt_ContextTypeDef *context);
static void PowerMgmt_WaitMs(uint32_t delay_ms);
static void PowerMgmt_BusyWaitLoops(uint32_t loop_count);
static void PowerMgmt_SetRadioRail(bool enabled);
static HAL_StatusTypeDef PowerMgmt_DeepSleepPhase(void);
static HAL_StatusTypeDef PowerMgmt_SensorReadPhase(void);
static HAL_StatusTypeDef PowerMgmt_RadioBurstPhase(void);
static HAL_StatusTypeDef PowerMgmt_RadioShutdownPhase(void);
static void PowerMgmt_BuildTelemetryPayload(uint8_t payload[POWER_MGMT_TELEMETRY_FRAME_LENGTH]);
static void PowerMgmt_BuildEmergencyPayload(uint8_t payload[POWER_MGMT_EMERGENCY_FRAME_LENGTH]);
static void PowerMgmt_BleTransmitAdvertisingPacket(const uint8_t *payload, uint8_t length);
static void PowerMgmt_BleTransmitAdvertisingPacketIsr(const uint8_t *payload, uint8_t length);
static void PowerMgmt_DisableTransientPeripherals(void);
static void PowerMgmt_ConfigureSafetyBaselines(void);
static void PowerMgmt_ClearTransmissionContext(void);

HAL_StatusTypeDef PowerMgmt_Init(void)
{
    HAL_StatusTypeDef status;

    g_context.raw_temperature = 0U;
    g_context.raw_humidity = 0U;
    g_context.last_temperature_byte = 0U;
    g_context.last_humidity_byte = 0U;
    g_context.uptime_hours = 0U;
    g_context.rtc_wakeup_pending = 0U;
    PowerMgmt_ClearTransmissionContext();

    status = PowerMgmt_SystemPowerConfig();
    if (status != HAL_OK)
    {
        return status;
    }

    PowerMgmt_SystemClockConfig();
    PowerMgmt_ConfigureDeepSleepGpio();

    status = PowerMgmt_RtcConfig();
    if (status != HAL_OK)
    {
        return status;
    }

    status = PowerMgmt_PvdConfig();
    if (status != HAL_OK)
    {
        return status;
    }

    return HAL_OK;
}

void PowerMgmt_Run(void)
{
    HAL_StatusTypeDef status;

    for (;;)
    {
        switch (g_state)
        {
            case POWER_MGMT_STATE_DEEP_SLEEP:
            {
                status = PowerMgmt_DeepSleepPhase();
                if (status == HAL_OK)
                {
                    g_state = POWER_MGMT_STATE_SENSOR_READ;
                }
                break;
            }

            case POWER_MGMT_STATE_SENSOR_READ:
            {
                status = PowerMgmt_SensorReadPhase();
                if (status == HAL_OK)
                {
                    g_state = POWER_MGMT_STATE_RADIO_BURST;
                }
                else
                {
                    g_state = POWER_MGMT_STATE_DEEP_SLEEP;
                }
                break;
            }

            case POWER_MGMT_STATE_RADIO_BURST:
            {
                status = PowerMgmt_RadioBurstPhase();
                if (status == HAL_OK)
                {
                    g_state = POWER_MGMT_STATE_RADIO_SHUTDOWN;
                }
                else
                {
                    g_state = POWER_MGMT_STATE_DEEP_SLEEP;
                }
                break;
            }

            case POWER_MGMT_STATE_RADIO_SHUTDOWN:
            {
                status = PowerMgmt_RadioShutdownPhase();
                if (status == HAL_OK)
                {
                    g_state = POWER_MGMT_STATE_DEEP_SLEEP;
                }
                break;
            }

            default:
            {
                g_state = POWER_MGMT_STATE_DEEP_SLEEP;
                break;
            }
        }
    }
}

void PowerMgmt_RtcWakeupIrqHandler(void)
{
    HAL_RTCEx_WakeUpTimerIRQHandler(&hrtc);
}

void PowerMgmt_HandlePvdInterrupt(void)
{
    uint8_t emergency_payload[POWER_MGMT_EMERGENCY_FRAME_LENGTH];

    if (__HAL_PWR_PVD_GET_FLAG() == RESET)
    {
        return;
    }

    /*
     * Stop the hourly wake loop immediately so a marginal battery cannot keep
     * waking the node into a brownout/restart cycle.
     */
    (void)HAL_RTCEx_DeactivateWakeUpTimer(&hrtc);

    PowerMgmt_BuildEmergencyPayload(emergency_payload);

    /*
     * Bring the radio rail up only for the emergency burst. The PMOS gate is
     * active-low, so driving PA1 low enables the module rail.
     */
    PowerMgmt_SetRadioRail(true);
    PowerMgmt_BusyWaitLoops(POWER_MGMT_PVD_STABILISE_LOOPS);
    PowerMgmt_BleTransmitAdvertisingPacketIsr(emergency_payload, POWER_MGMT_EMERGENCY_FRAME_LENGTH);

    /*
     * Immediately isolate the radio again so no residual current leaks through
     * the module while the supply is falling.
     */
    PowerMgmt_SetRadioRail(false);
    PowerMgmt_DisableTransientPeripherals();
    PowerMgmt_ConfigureSafetyBaselines();

    __disable_irq();
    HAL_PWREx_EnterSHUTDOWNMode();

    for (;;)
    {
    }
}

void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc_unused)
{
    (void)hrtc_unused;
    g_context.rtc_wakeup_pending = 1U;
}

static HAL_StatusTypeDef PowerMgmt_SystemPowerConfig(void)
{
    __HAL_RCC_PWR_CLK_ENABLE();

    /*
     * Ultra-low-power and fast wake-up trim the STOP-mode transition cost and
     * keep the hourly cadence efficient once the node is deployed.
     */
    HAL_PWREx_EnableUltraLowPower();
    HAL_PWREx_EnableFastWakeUp();

    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE3);

    return HAL_OK;
}

static void PowerMgmt_SystemClockConfig(void)
{
    RCC_OscInitTypeDef osc_init = {0};
    RCC_ClkInitTypeDef clock_init = {0};

    osc_init.OscillatorType = RCC_OSCILLATORTYPE_MSI;
    osc_init.MSIState = RCC_MSI_ON;
    osc_init.MSIClockRange = RCC_MSIRANGE_5;
    osc_init.MSICalibrationValue = 0U;
    osc_init.PLL.PLLState = RCC_PLL_NONE;

    if (HAL_RCC_OscConfig(&osc_init) != HAL_OK)
    {
        return;
    }

    clock_init.ClockType = (RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                            RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2);
    clock_init.SYSCLKSource = RCC_SYSCLKSOURCE_MSI;
    clock_init.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clock_init.APB1CLKDivider = RCC_HCLK_DIV1;
    clock_init.APB2CLKDivider = RCC_HCLK_DIV1;

    (void)HAL_RCC_ClockConfig(&clock_init, FLASH_LATENCY_0);
}

static HAL_StatusTypeDef PowerMgmt_RtcConfig(void)
{
    RCC_OscInitTypeDef osc_init = {0};
    RCC_PeriphCLKInitTypeDef periph_clk = {0};

    __HAL_RCC_RTC_ENABLE();
    HAL_PWR_EnableBkUpAccess();

    osc_init.OscillatorType = RCC_OSCILLATORTYPE_LSE;
    osc_init.LSEState = RCC_LSE_ON;
    osc_init.PLL.PLLState = RCC_PLL_NONE;

    if (HAL_RCC_OscConfig(&osc_init) != HAL_OK)
    {
        return HAL_ERROR;
    }

    periph_clk.PeriphClockSelection = RCC_PERIPHCLK_RTC;
    periph_clk.RTCClockSelection = RCC_RTCCLKSOURCE_LSE;
    if (HAL_RCCEx_PeriphCLKConfig(&periph_clk) != HAL_OK)
    {
        return HAL_ERROR;
    }

    hrtc.Instance = RTC;
    hrtc.Init.HourFormat = RTC_HOURFORMAT_24;
    hrtc.Init.AsynchPrediv = 127U;
    hrtc.Init.SynchPrediv = 255U;
    hrtc.Init.OutPut = RTC_OUTPUT_DISABLE;
    hrtc.Init.OutPutPolarity = RTC_OUTPUT_POLARITY_HIGH;
    hrtc.Init.OutPutType = RTC_OUTPUT_TYPE_OPENDRAIN;

    if (HAL_RTC_Init(&hrtc) != HAL_OK)
    {
        return HAL_ERROR;
    }

    __HAL_RTC_WAKEUPTIMER_DISABLE(&hrtc);
    (void)HAL_RTCEx_DeactivateWakeUpTimer(&hrtc);
    __HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU);

    HAL_NVIC_SetPriority(RTC_IRQn, 1U, 0U);
    HAL_NVIC_EnableIRQ(RTC_IRQn);

    return HAL_OK;
}

static HAL_StatusTypeDef PowerMgmt_PvdConfig(void)
{
    PWR_PVDTypeDef pvd_config;

    /*
     * On STM32L0, PWR_PVDLEVEL_0 corresponds to approximately 2.2 V. This is
     * the earliest sensible trip point for a 1-cell Li-SOCl2 design that needs
     * time to flush a final packet before the battery collapses further.
     */
    pvd_config.PVDLevel = PWR_PVDLEVEL_0;
    pvd_config.Mode = PWR_PVD_MODE_IT_FALLING;

    if (HAL_PWR_ConfigPVD(&pvd_config) != HAL_OK)
    {
        return HAL_ERROR;
    }

    __HAL_PWR_PVD_EXTI_CLEAR_FLAG();
    __HAL_PWR_PVD_EXTI_ENABLE_IT();
    __HAL_PWR_PVD_EXTI_ENABLE_FALLING_EDGE();
    __HAL_PWR_PVD_EXTI_DISABLE_RISING_EDGE();

    HAL_NVIC_SetPriority(PVD_IRQn, 0U, 0U);
    HAL_NVIC_EnableIRQ(PVD_IRQn);

    HAL_PWR_EnablePVD();

    return HAL_OK;
}

static void PowerMgmt_ConfigureDeepSleepGpio(void)
{
    GPIO_InitTypeDef gpio_init;

    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();

    gpio_init.Pin = GPIO_PIN_All;
    gpio_init.Mode = GPIO_MODE_ANALOG;
    gpio_init.Pull = GPIO_NOPULL;
    gpio_init.Speed = GPIO_SPEED_FREQ_LOW;

    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_All);
    HAL_GPIO_DeInit(GPIOB, GPIO_PIN_All);
    HAL_GPIO_DeInit(GPIOC, GPIO_PIN_All);

    HAL_GPIO_Init(GPIOA, &gpio_init);
    HAL_GPIO_Init(GPIOB, &gpio_init);
    HAL_GPIO_Init(GPIOC, &gpio_init);

    /*
     * PA1 controls the PMOS gate. It must remain a driven output so the radio
     * rail stays physically isolated during sleep.
     */
    gpio_init.Pin = GPIO_PIN_1;
    gpio_init.Mode = GPIO_MODE_OUTPUT_PP;
    gpio_init.Pull = GPIO_NOPULL;
    gpio_init.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &gpio_init);
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_1, GPIO_PIN_SET);
}

static HAL_StatusTypeDef PowerMgmt_InitI2c1(void)
{
    GPIO_InitTypeDef gpio_init;

    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_I2C1_CLK_ENABLE();

    gpio_init.Pin = GPIO_PIN_9 | GPIO_PIN_10;
    gpio_init.Mode = GPIO_MODE_AF_OD;
    gpio_init.Pull = GPIO_PULLUP;
    gpio_init.Speed = GPIO_SPEED_FREQ_LOW;
    gpio_init.Alternate = GPIO_AF6_I2C1;
    HAL_GPIO_Init(GPIOA, &gpio_init);

    hi2c1.Instance = I2C1;
    hi2c1.Init.Timing = POWER_MGMT_I2C1_TIMING;
    hi2c1.Init.OwnAddress1 = 0U;
    hi2c1.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;
    hi2c1.Init.DualAddressMode = I2C_DUALADDRESS_DISABLE;
    hi2c1.Init.OwnAddress2 = 0U;
    hi2c1.Init.OwnAddress2Masks = I2C_OA2_NOMASK;
    hi2c1.Init.GeneralCallMode = I2C_GENERALCALL_DISABLE;
    hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_DISABLE;

    if (HAL_I2C_Init(&hi2c1) != HAL_OK)
    {
        return HAL_ERROR;
    }

    return HAL_OK;
}

static HAL_StatusTypeDef PowerMgmt_DeinitI2c1(void)
{
    if (HAL_I2C_DeInit(&hi2c1) != HAL_OK)
    {
        return HAL_ERROR;
    }

    __HAL_RCC_I2C1_CLK_DISABLE();
    return HAL_OK;
}

static HAL_StatusTypeDef PowerMgmt_Bme280EnterForcedMode(void)
{
    uint8_t ctrl_hum;
    uint8_t ctrl_meas;

    ctrl_hum = 0x01U;
    ctrl_meas = 0x25U;

    if (HAL_I2C_Mem_Write(&hi2c1,
                          POWER_MGMT_BME280_I2C_ADDRESS,
                          POWER_MGMT_BME280_REG_CTRL_HUM,
                          I2C_MEMADD_SIZE_8BIT,
                          &ctrl_hum,
                          1U,
                          POWER_MGMT_I2C_TIMEOUT_MS) != HAL_OK)
    {
        return HAL_ERROR;
    }

    if (HAL_I2C_Mem_Write(&hi2c1,
                          POWER_MGMT_BME280_I2C_ADDRESS,
                          POWER_MGMT_BME280_REG_CTRL_MEAS,
                          I2C_MEMADD_SIZE_8BIT,
                          &ctrl_meas,
                          1U,
                          POWER_MGMT_I2C_TIMEOUT_MS) != HAL_OK)
    {
        return HAL_ERROR;
    }

    return HAL_OK;
}

static HAL_StatusTypeDef PowerMgmt_Bme280ReadRaw(PowerMgmt_ContextTypeDef *context)
{
    uint8_t raw_frame[8U];
    uint32_t raw_temperature;
    uint16_t raw_humidity;
    uint8_t last_temperature_byte;
    uint8_t last_humidity_byte;

    if (HAL_I2C_Mem_Read(&hi2c1,
                         POWER_MGMT_BME280_I2C_ADDRESS,
                         POWER_MGMT_BME280_REG_DATA_START,
                         I2C_MEMADD_SIZE_8BIT,
                         raw_frame,
                         sizeof(raw_frame),
                         POWER_MGMT_I2C_TIMEOUT_MS) != HAL_OK)
    {
        return HAL_ERROR;
    }

    raw_temperature = (((uint32_t)raw_frame[3] << 12U) |
                       ((uint32_t)raw_frame[4] << 4U) |
                       ((uint32_t)raw_frame[5] >> 4U));
    raw_humidity = (uint16_t)(((uint16_t)raw_frame[6] << 8U) |
                              ((uint16_t)raw_frame[7]));
    last_temperature_byte = (uint8_t)((raw_temperature >> 12U) & 0xFFU);
    last_humidity_byte = (uint8_t)((raw_humidity >> 8U) & 0xFFU);

    primask = __get_PRIMASK();
    __disable_irq();
    context->raw_temperature = raw_temperature;
    context->raw_humidity = raw_humidity;
    context->last_temperature_byte = last_temperature_byte;
    context->last_humidity_byte = last_humidity_byte;
    if (primask == 0U)
    {
        __enable_irq();
    }

    return HAL_OK;
}

static void PowerMgmt_WaitMs(uint32_t delay_ms)
{
    uint32_t start_tick;

    start_tick = HAL_GetTick();

    while ((HAL_GetTick() - start_tick) < delay_ms)
    {
        __WFI();
    }
}

static void PowerMgmt_BusyWaitLoops(uint32_t loop_count)
{
    volatile uint32_t counter;

    counter = loop_count;
    while (counter > 0U)
    {
        __NOP();
        counter--;
    }
}

static void PowerMgmt_SetRadioRail(bool enabled)
{
    if (enabled)
    {
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_1, GPIO_PIN_RESET);
    }
    else
    {
        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_1, GPIO_PIN_SET);
    }
}

static HAL_StatusTypeDef PowerMgmt_DeepSleepPhase(void)
{
    HAL_StatusTypeDef status;

    PowerMgmt_SetRadioRail(false);
    PowerMgmt_ConfigureDeepSleepGpio();

    /*
     * Re-arm the hourly RTC wake-up source every time we go back to deep sleep.
     * Using CK_SPRE gives a 1 Hz clock when the RTC is driven from LSE, so the
     * 3600-second interval fits directly in the wakeup counter.
     */
    (void)HAL_RTCEx_DeactivateWakeUpTimer(&hrtc);
    __HAL_PWR_CLEAR_FLAG(PWR_FLAG_WU);

    status = HAL_RTCEx_SetWakeUpTimer_IT(&hrtc,
                                         POWER_MGMT_RTC_WAKEUP_SECONDS,
                                         RTC_WAKEUPCLOCK_CK_SPRE_16BITS);
    if (status != HAL_OK)
    {
        return HAL_ERROR;
    }

    g_context.rtc_wakeup_pending = 0U;
    HAL_SuspendTick();

    HAL_PWR_EnterSTOPMode(PWR_LOWPOWERREGULATOR_ON, PWR_STOPENTRY_WFI);

    /*
     * Execution resumes here after the RTC interrupt wakes the core. The MSI
     * is reselected so the firmware returns to the low run clock profile before
     * touching peripherals again.
     */
    PowerMgmt_SystemClockConfig();
    HAL_ResumeTick();

    if (g_context.rtc_wakeup_pending != 0U)
    {
        g_context.rtc_wakeup_pending = 0U;
    }

    g_context.uptime_hours++;

    return HAL_OK;
}

static HAL_StatusTypeDef PowerMgmt_SensorReadPhase(void)
{
    HAL_StatusTypeDef status;

    status = PowerMgmt_InitI2c1();
    if (status != HAL_OK)
    {
        return status;
    }

    status = PowerMgmt_Bme280EnterForcedMode();
    if (status != HAL_OK)
    {
        (void)PowerMgmt_DeinitI2c1();
        return status;
    }

    /*
     * The BME280 needs a short conversion window after the forced-mode trigger.
     * We stay awake only for this deterministic measurement interval, then
     * immediately tear I2C back down to remove static bus power draw.
     */
    PowerMgmt_WaitMs(POWER_MGMT_SENSOR_STABILISE_MS);

    status = PowerMgmt_Bme280ReadRaw(&g_context);
    (void)PowerMgmt_DeinitI2c1();
    return status;
}

static HAL_StatusTypeDef PowerMgmt_RadioBurstPhase(void)
{
    uint8_t payload[POWER_MGMT_TELEMETRY_FRAME_LENGTH];

    PowerMgmt_SetRadioRail(true);
    PowerMgmt_WaitMs(POWER_MGMT_RADIO_INRUSH_MS);

    PowerMgmt_BuildTelemetryPayload(payload);
    PowerMgmt_BleTransmitAdvertisingPacket(payload, POWER_MGMT_TELEMETRY_FRAME_LENGTH);

    return HAL_OK;
}

static HAL_StatusTypeDef PowerMgmt_RadioShutdownPhase(void)
{
    PowerMgmt_SetRadioRail(false);
    PowerMgmt_ClearTransmissionContext();

    /*
     * A brief cleanup window lets any last register writes and software state
     * settle before the node drops back into its long sleep interval.
     */
    PowerMgmt_WaitMs(POWER_MGMT_RADIO_SHUTDOWN_MS);

    return HAL_OK;
}

static void PowerMgmt_BuildTelemetryPayload(uint8_t payload[POWER_MGMT_TELEMETRY_FRAME_LENGTH])
{
    payload[0] = 0x53U;
    payload[1] = g_context.last_temperature_byte;
    payload[2] = (uint8_t)(g_context.raw_temperature >> 4U);
    payload[3] = g_context.last_humidity_byte;
    payload[4] = (uint8_t)(g_context.raw_humidity & 0xFFU);
    payload[5] = (uint8_t)(g_context.uptime_hours >> 8U);
}

static void PowerMgmt_BuildEmergencyPayload(uint8_t payload[POWER_MGMT_EMERGENCY_FRAME_LENGTH])
{
    payload[0] = 0xBEU;
    payload[1] = 0xEFU;
    payload[2] = 0xE0U;
    payload[3] = g_context.last_temperature_byte;
    payload[4] = g_context.last_humidity_byte;
    payload[5] = (uint8_t)(g_context.uptime_hours >> 8U);
}

static void PowerMgmt_BleTransmitAdvertisingPacket(const uint8_t *payload, uint8_t length)
{
    uint8_t index;

    for (index = 0U; index < length && index < POWER_MGMT_TELEMETRY_FRAME_LENGTH; index++)
    {
        g_context.radio_tx_buffer[index] = payload[index];
    }

    /*
     * Mock the 1 ms non-connectable advertising window. The implementation is
     * intentionally tiny and deterministic so the code path remains easy to
     * replace with a real radio driver later.
     */
    PowerMgmt_WaitMs(POWER_MGMT_RADIO_AIRTIME_MS);
}

static void PowerMgmt_BleTransmitAdvertisingPacketIsr(const uint8_t *payload, uint8_t length)
{
    uint8_t index;

    for (index = 0U; index < length && index < POWER_MGMT_TELEMETRY_FRAME_LENGTH; index++)
    {
        g_context.radio_tx_buffer[index] = payload[index];
    }

    /*
     * ISR-safe mock transmission: no HAL tick dependency, just a short busy
     * window that approximates the emergency broadcast airtime.
     */
    PowerMgmt_BusyWaitLoops(POWER_MGMT_ISR_AIRTIME_LOOPS);
}

static void PowerMgmt_DisableTransientPeripherals(void)
{
    (void)HAL_I2C_DeInit(&hi2c1);

    __HAL_RCC_I2C1_CLK_DISABLE();
    __HAL_RCC_GPIOA_CLK_DISABLE();
    __HAL_RCC_GPIOB_CLK_DISABLE();
    __HAL_RCC_GPIOC_CLK_DISABLE();
}

static void PowerMgmt_ConfigureSafetyBaselines(void)
{
    GPIO_InitTypeDef gpio_init;

    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();

    gpio_init.Pin = GPIO_PIN_All;
    gpio_init.Mode = GPIO_MODE_ANALOG;
    gpio_init.Pull = GPIO_NOPULL;
    gpio_init.Speed = GPIO_SPEED_FREQ_LOW;

    HAL_GPIO_DeInit(GPIOA, GPIO_PIN_All);
    HAL_GPIO_DeInit(GPIOB, GPIO_PIN_All);
    HAL_GPIO_DeInit(GPIOC, GPIO_PIN_All);

    HAL_GPIO_Init(GPIOA, &gpio_init);
    HAL_GPIO_Init(GPIOB, &gpio_init);
    HAL_GPIO_Init(GPIOC, &gpio_init);

    gpio_init.Pin = GPIO_PIN_1;
    gpio_init.Mode = GPIO_MODE_OUTPUT_PP;
    gpio_init.Pull = GPIO_NOPULL;
    gpio_init.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(GPIOA, &gpio_init);
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_1, GPIO_PIN_SET);
}

static void PowerMgmt_ClearTransmissionContext(void)
{
    uint32_t index;

    for (index = 0U; index < POWER_MGMT_TELEMETRY_FRAME_LENGTH; index++)
    {
        g_context.radio_tx_buffer[index] = 0U;
    }
}
