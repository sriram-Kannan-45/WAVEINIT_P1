const http = require('http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');

jest.mock('../src/services/assessmentVerificationService', () => ({ authorizeSocket:jest.fn() }));
jest.mock('../src/services/monitoringService', () => ({ validateMobile:jest.fn() }));
jest.mock('../src/socket/crossInstance', () => ({ relayEmit:jest.fn((io, kind, target, event, data, options={}) => {
  const sender = options.excludingSocket || io;
  sender.to(target).emit(event, data);
}) }));
const verification = require('../src/services/assessmentVerificationService');
const monitoring = require('../src/services/monitoringService');
const register = require('../src/socket/assessmentVerificationEvents');
const relay = require('../src/socket/crossInstance');
const once = (socket, name) => new Promise((resolve,reject) => {
  const timer = setTimeout(() => reject(new Error(`Missing ${name}`)), 3000);
  socket.once(name, data => { clearTimeout(timer); resolve(data); });
});
const emitAck = (socket, event, data) => socket.timeout(3000).emitWithAck(event,data);

test('real sockets deliver frames and receipt ACKs while AI is still loading, with room isolation', async () => {
  const server = http.createServer();
  const io = new Server(server);
  const clients = [];
  let finishAI;
  verification.authorizeSocket.mockImplementation(async ({sessionId}) => ({session:{session_id:sessionId}, monitor:{sessionId:'monitor'}}));
  monitoring.validateMobile.mockImplementation(() => new Promise(resolve => { finishAI=resolve; }));
  io.on('connection', socket => {
    socket.userId=7;
    if(socket.handshake.auth.mobile) socket.assessmentMobileClaims={token:'test'};
    register(io,socket);
  });
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${server.address().port}`;
    const laptop=connect(url,{transports:['polling'],forceNew:true}); clients.push(laptop);
    await once(laptop,'connect');
    expect(await emitAck(laptop,'assessment_verif:join',{sessionId:'test-room',role:'laptop'})).toMatchObject({ok:true});
    const phone=connect(url,{auth:{mobile:true},transports:['polling'],forceNew:true}); clients.push(phone);
    await once(phone,'connect');
    expect(await emitAck(phone,'assessment_verif:join',{sessionId:'test-room',role:'mobile_camera'})).toMatchObject({ok:true});
    const frameReceived=once(laptop,'assessment_verif:frame');
    expect(await emitAck(phone,'assessment_verif:frame',{sessionId:'test-room',frame:'jpeg-first'})).toEqual({ok:true});
    expect(await frameReceived).toMatchObject({frame:'jpeg-first'});
    expect(monitoring.validateMobile).toHaveBeenCalledTimes(1);
    const receipt=once(phone,'assessment_verif:desktop_receiving');
    laptop.emit('assessment_verif:frame_received',{sessionId:'test-room'});
    expect(await receipt).toHaveProperty('timestamp');
    await new Promise(resolve=>setTimeout(resolve,550));
    const second=once(laptop,'assessment_verif:frame');
    expect(await emitAck(phone,'assessment_verif:frame',{sessionId:'test-room',frame:'jpeg-second'})).toEqual({ok:true});
    expect(await second).toMatchObject({frame:'jpeg-second'});
    expect(monitoring.validateMobile).toHaveBeenCalledTimes(1);
    expect(await emitAck(phone,'assessment_verif:frame',{sessionId:'another-room',frame:'private'})).toMatchObject({ok:false});
    expect(relay.relayEmit.mock.calls.some(call=>call[3]==='assessment_verif:frame')).toBe(false);
    phone.disconnect();
    finishAI({success:false});
    monitoring.validateMobile.mockResolvedValue({success:false});
    const replacement=connect(url,{auth:{mobile:true},transports:['polling'],forceNew:true}); clients.push(replacement);
    await once(replacement,'connect');
    expect(await emitAck(replacement,'assessment_verif:join',{sessionId:'test-room',role:'mobile_camera'})).toMatchObject({ok:true,sessionId:'test-room'});
    const resumedFrame=once(laptop,'assessment_verif:frame');
    expect(await emitAck(replacement,'assessment_verif:frame',{sessionId:'test-room',frame:'jpeg-reconnected'})).toEqual({ok:true});
    expect(await resumedFrame).toMatchObject({frame:'jpeg-reconnected'});
  } finally {
    finishAI?.({success:false});
    clients.forEach(client=>client.disconnect());
    await new Promise(resolve=>io.close(resolve));
  }
}, 12000);
