#include "stm32l0xx_hal.h"

#include "power_mgmt.h"

void NMI_Handler(void)
{
    for (;;)
    {
    }
}

void HardFault_Handler(void)
{
    for (;;)
    {
    }
}

void SVC_Handler(void)
{
}

void PendSV_Handler(void)
{
}

void SysTick_Handler(void)
{
    HAL_IncTick();
}

void RTC_IRQHandler(void)
{
    PowerMgmt_RtcWakeupIrqHandler();
}

void PVD_IRQHandler(void)
{
    /*
     * The PVD line is level sensitive on the internal comparator output, so
     * we verify the pending condition before executing the loss-of-power path.
     */
    if (__HAL_PWR_PVD_GET_FLAG() != RESET)
    {
        PowerMgmt_HandlePvdInterrupt();
    }

    __HAL_PWR_PVD_EXTI_CLEAR_FLAG();
}
