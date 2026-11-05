"""Simulated crypto.  NOT SECURE, stdlib has no ECDSA P-256.

The simulator needs sign/verify with the same *shape* as the protocol (64-byte
r||s signatures, 64-byte X||Y public keys) so frames round-trip, but the maths is
HMAC-SHA256.  A process-wide keyring maps public key -> secret so that a verifier
holding only the public key can check a signature.  Replace `SimKey` with a real
P-256 implementation for hardware-in-the-loop use.
"""
from __future__ import annotations

import hashlib
import hmac
import random
import zlib

_KEYRING: dict[bytes, bytes] = {}


class SimKey:
    def __init__(self, secret: bytes):
        self.secret = secret
        self.pub = hashlib.sha512(b"SIM-PUB" + secret).digest()  # 64 bytes
        _KEYRING[self.pub] = secret

    @classmethod
    def from_seed(cls, seed: str) -> "SimKey":
        return cls(hashlib.sha256(seed.encode()).digest())

    def sign(self, msg: bytes) -> bytes:
        return sign(self.secret, msg)


def sign(secret: bytes, msg: bytes) -> bytes:
    return (hmac.new(secret, b"r" + msg, hashlib.sha256).digest()
            + hmac.new(secret, b"s" + msg, hashlib.sha256).digest())


def verify(pub: bytes, msg: bytes, sig: bytes) -> bool:
    secret = _KEYRING.get(bytes(pub))
    if secret is None or len(sig) != 64:
        return False
    return hmac.compare_digest(sign(secret, msg), bytes(sig))


def derive_passkey(k_pair: bytes, device_id: int, nonce: int) -> int:
    """passkey = u32_le(HMAC-SHA256(K_pair, 'AEVEA-PK'||device_id_le||nonce_le)[0..3]) mod 1_000_000

    The spec writes [0..3]; a u32 needs 4 bytes so this is digest[0:4] (see SPEC_ISSUES.md).
    """
    mac = hmac.new(k_pair, b"AEVEA-PK" + device_id.to_bytes(8, "little")
                   + nonce.to_bytes(4, "little"), hashlib.sha256).digest()
    return int.from_bytes(mac[0:4], "little") % 1_000_000


def auth_digest(app_nonce: bytes, device_nonce: bytes, device_id: int) -> bytes:
    return hashlib.sha256(b"AEVEA-AUTH" + app_nonce + device_nonce
                          + device_id.to_bytes(8, "little")).digest()


def crc32(data: bytes) -> int:
    """CRC-32/ISO-HDLC (zlib)."""
    return zlib.crc32(data) & 0xFFFFFFFF


def rng(seed: int | None) -> random.Random:
    return random.Random(seed)
