/* DFU state machine skeleton (service 0x0300). NOT TESTED ON HARDWARE.
 * Signature / hash / anti-rollback checks go through aev_crypto_hal_t hooks; the bootloader swap and
 * rollback go through aev_boot_hal_t. The core never trusts an image it has not verified. */
#ifndef AEVEA_DFU_H
#define AEVEA_DFU_H
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

struct aev_dev;

typedef struct {
    uint8_t state;              /* AEV_DFU_STATE_* */
    uint8_t image_type;
    uint32_t size, offset;      /* offset = next expected byte */
    uint32_t crc;               /* CRC-32/ISO-HDLC of bytes 0..offset-1 */
    uint8_t maj, min, patch;
    uint16_t build;
    uint8_t sha256[32];
    uint32_t last_checkpoint;
    bool deadline_armed;
    uint32_t deadline_start_ms;
} aev_dfu_t;

void aev_dfu_boot(struct aev_dev *d);                          /* after settings load: test-boot / rollback logic */
void aev_dfu_ctrl(struct aev_dev *d, const uint8_t *b, size_t n);
void aev_dfu_data(struct aev_dev *d, const uint8_t *b, size_t n);
void aev_dfu_poll(struct aev_dev *d);                          /* confirm deadline */
#endif
