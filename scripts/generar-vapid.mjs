// Genera las claves VAPID para Web Push. Corre una sola vez: si cambian, hay que volver a suscribir cada dispositivo.
const algoritmo = { name: 'ECDSA', namedCurve: 'P-256' };
const claves = await crypto.subtle.generateKey(algoritmo, true, ['sign', 'verify']);

const publicaCruda = Buffer.from(await crypto.subtle.exportKey('raw', claves.publicKey)).toString('base64url');
const exportadas = {
  publicKey: await crypto.subtle.exportKey('jwk', claves.publicKey),
  privateKey: await crypto.subtle.exportKey('jwk', claves.privateKey),
};

console.log('VITE_VAPID_PUBLIC (pública, va en la app):\n');
console.log(publicaCruda);
console.log('\nVAPID_KEYS (PRIVADA, solo como secreto de Supabase):\n');
console.log(JSON.stringify(exportadas));
