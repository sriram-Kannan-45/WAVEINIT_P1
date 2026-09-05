import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileCameraStatus } from '../src/utils/mobileCameraStatus.mjs';
const now=10000;
const evidence={receivedAt:now,person_detected:true,laptop_detected:true};
test('missing objects warn without offering QR reconnection; repositioning recovers', () => {
  for (const [person,laptop,title] of [[false,true,'Person'],[true,false,'Laptop'],[false,false,'Person and laptop']]) {
    const result=mobileCameraStatus({connected:true,now,evidence:{...evidence,person_detected:person,laptop_detected:laptop}});
    assert.equal(result.kind,'reposition'); assert.equal(result.title,`${title} not detected`);
    assert.match(result.message,/no QR scan is needed/);
  }
  assert.equal(mobileCameraStatus({connected:true,now,evidence}).kind,'ready');
});
test('lost video stays disconnected despite a previously valid detector result and recovers on new video', () => {
  assert.equal(mobileCameraStatus({connected:false,now,evidence}).kind,'disconnected');
  assert.equal(mobileCameraStatus({connected:true,now,evidence}).kind,'ready');
});
test('delayed detection preserves live connection and does not offer a new scan', () => {
  assert.equal(mobileCameraStatus({connected:true,now,evidence:null}).kind,'checking');
  assert.equal(mobileCameraStatus({connected:true,now:now+6000,evidence}).kind,'checking');
});
