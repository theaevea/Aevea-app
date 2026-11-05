"""Stand-in for the Aevea cloud: factory provisioning, registry, passkeys,
owner tokens, firmware signing and the LTE-M command path."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from . import crypto
from .codec import Codec
from .spec import Spec, load


@dataclass
class DeviceCredentials:
    device_id: int
    device_type: int
    hw_rev: int
    k_pair: bytes
    key: crypto.SimKey
    cert: bytes


@dataclass
class CloudStub:
    spec: Spec = field(default_factory=load)
    seed: int = 1
    ca_key_id: int = 0xAE7E0001
    inbox: list = field(default_factory=list)       # things devices sent to the cloud
    registry: dict = field(default_factory=dict)
    nonce_seen: dict = field(default_factory=dict)

    def __post_init__(self):
        self.codec = Codec(self.spec)
        self.ca = crypto.SimKey.from_seed(f"ca-{self.seed}")
        self.owner_key = crypto.SimKey.from_seed(f"owner-token-{self.seed}")
        self.boot_key = crypto.SimKey.from_seed(f"boot-{self.seed}")
        self._rng = crypto.rng(self.seed)
        self._next_id = 0x00A3E70100000123

    # factory --------------------------------------------------------
    def provision(self, device_type: str, hw_rev: int = 2, issued: int = 1793880000) -> DeviceCredentials:
        dt = int(self.spec.E("device_type")[device_type])
        did = self._next_id
        self._next_id += 1
        key = crypto.SimKey.from_seed(f"devkey-{self.seed}-{did}")
        k_pair = hashlib.sha256(f"kpair-{self.seed}-{did}".encode()).digest()
        body = self.codec.encode_struct("device_cert", {
            "cert_ver": 1, "device_id": did, "device_type": dt, "hw_rev": hw_rev,
            "pubkey": key.pub, "issued": issued, "ca_key_id": self.ca_key_id,
            "signature": bytes(64)})[:-64]
        cert = body + self.ca.sign(body)
        cred = DeviceCredentials(did, dt, hw_rev, k_pair, key, cert)
        self.registry[did] = cred
        return cred

    # pairing / ownership --------------------------------------------
    def passkey_for(self, device_id: int, pairing_nonce: int) -> int:
        return crypto.derive_passkey(self.registry[device_id].k_pair, device_id, pairing_nonce)

    def owner_token(self, device_id: int, owner_id: bytes, purpose: int, issued: int,
                    ttl_s: int = 600, token_ver: int = 1) -> bytes:
        body = self.codec.encode_struct("owner_token", {
            "token_ver": token_ver, "purpose": purpose, "device_id": device_id,
            "owner_id": owner_id, "issued": issued, "expires": issued + ttl_s,
            "signature": bytes(64)})[:-64]
        return body + self.owner_key.sign(body)

    def verify_cert(self, cert: bytes) -> bool:
        if len(cert) != 147:
            return False
        return crypto.verify(self.ca.pub, cert[:-64], cert[-64:])

    def verify_auth(self, cert: bytes, app_nonce: bytes, device_nonce: bytes, signature: bytes) -> bool:
        c = self.codec.decode_struct("device_cert", cert)
        return crypto.verify(c["pubkey"], crypto.auth_digest(app_nonce, device_nonce, c["device_id"]),
                             signature)

    # LTE-M path ------------------------------------------------------
    def send_to_link(self, link, frame: bytes) -> None:
        """Queue a command frame for delivery over LTE-M (eDRX / fast paging)."""
        link.lte_enqueue(frame)

    def receive(self, source: str, kind: str, data: dict) -> None:
        self.inbox.append({"t": None, "from": source, "kind": kind, **data})
