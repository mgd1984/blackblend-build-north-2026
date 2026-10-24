import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { verifyClerkSession } from '../lib/clerk-session.ts';
test('Clerk sessions require the configured issuer, origin, live expiry and session ID', async()=>{
 const issuer='https://blackblend-test.clerk.accounts.dev', origin='https://studio.example.com';
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const jwk=await exportJWK(publicKey);jwk.kid='test';
 const original=globalThis.fetch;
 globalThis.fetch=async url=>{assert.equal(String(url),issuer+'/.well-known/jwks.json');return Response.json({keys:[jwk]});};
 const token=(claims={},iss=issuer,expiry='2m')=>new SignJWT({sid:'sess_test',azp:origin,...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(iss).setSubject('user_test').setIssuedAt().setExpirationTime(expiry).sign(privateKey);
 try {
  assert.equal(await verifyClerkSession(await token(),issuer,origin),'clerk:user_test');
  await assert.rejects(verifyClerkSession(await token({azp:'https://evil.example'}),issuer,origin));
  await assert.rejects(verifyClerkSession(await token({sid:null}),issuer,origin));
  await assert.rejects(verifyClerkSession(await token({},'https://another.clerk.accounts.dev'),issuer,origin));
  await assert.rejects(verifyClerkSession(await token({},issuer,'-2m'),issuer,origin));
  await assert.rejects(verifyClerkSession('forged',issuer,origin));
 }finally{globalThis.fetch=original;}
});
