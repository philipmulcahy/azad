/* Copyright(c) 2025 Philip Mulcahy. */

'use strict';

import * as forge from 'node-forge';

const publicKey = forge.pki.publicKeyFromPem(`
-----BEGIN RSA PUBLIC KEY-----
MIIBigKCAYEAl4+VzBJsn39ykBv+DoPiMP9VU+eTSG+PU7e3vB6LXtOSr1XxoT3l
s0+LuGa65jXe6PV/q0pJzC2mCIDsXEzjx1sf6mbwepJuHyyygnULy0N2UsfwwOyE
IozuycdtZEdVXMio6KEheBtQ7ZP6OifIOtrYH7N/vzJfnxAxHJIo63AcgjghbABm
seTPBL2i74q4myUn4kO44ayJF9oehi6Dz/pUqLALqVcf2ETI0VvhBFTUBjU9or34
KxARNj9pkTvCRl1fe02BKVTuAqoA4EzjPe+1lRioAb+5POM/TUDxoZhIhRtI9a7n
lBgeVOGJe38B8cVmEV2a3WD3KLsvt740eFD3lcxccJVMNuS11/oOLplxBbG9/CU3
4MzoTjoOGF+RLTY89MMbSGGQRyNntQIcT5z0DkC8ghl1loDkt3qdGbWwYIfe56fN
1HfibZHdPxERb5NWMyZE8HsKYspfkDgUB0mP0YHttOk09ox6XQQNNL1Q2fAlDREB
6eDC3LmT+1ztAgMBAAE=
-----END RSA PUBLIC KEY-----
`);

export function encrypt(text: string): string {
  const encrypted = publicKey.encrypt(
    text,
    'RSAES-PKCS1-V1_5',
  );

  const encrypted64 = forge.util.encode64(encrypted);
  return encrypted64;
}
