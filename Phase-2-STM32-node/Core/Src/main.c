#include "stm32l0xx_hal.h"

#include "power_mgmt.h"

static void Error_Handler(void);

int main(void)
{
    HAL_StatusTypeDef status;

    HAL_Init();

    status = PowerMgmt_Init();
    if (status != HAL_OK)
    {
        Error_Handler();
    }

    PowerMgmt_Run();

    for (;;)
    {
        /* The state machine never returns. */
    }
}

static void Error_Handler(void)
{
    __disable_irq();

    for (;;)
    {
        /*
         * Keep the core quiescent if an unrecoverable initialization error
         * occurs. A WFI here avoids wasting energy during fault escalation.
         */
        __WFI();
    }
}
