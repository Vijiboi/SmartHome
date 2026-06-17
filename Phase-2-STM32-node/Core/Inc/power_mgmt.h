#ifndef POWER_MGMT_H
#define POWER_MGMT_H

#include <stdint.h>

#include "stm32l0xx_hal.h"

typedef enum
{
    POWER_MGMT_STATE_DEEP_SLEEP = 0U,
    POWER_MGMT_STATE_SENSOR_READ,
    POWER_MGMT_STATE_RADIO_BURST,
    POWER_MGMT_STATE_RADIO_SHUTDOWN
} PowerMgmt_StateTypeDef;

HAL_StatusTypeDef PowerMgmt_Init(void);
void PowerMgmt_Run(void);

void PowerMgmt_RtcWakeupIrqHandler(void);
void PowerMgmt_HandlePvdInterrupt(void);

void HAL_RTCEx_WakeUpTimerEventCallback(RTC_HandleTypeDef *hrtc);

#endif /* POWER_MGMT_H */
