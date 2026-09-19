const http = require('http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');

jest.mock('../src/services/assessmentVerificationService', () => ({ authorizeSocket:jest.fn() }));
jest.mock('../src/services/monitoringService', () => ({ validateMobile:jest.fn() }));
jest.mock('../src/services/hireProctoringService', () => ({ analyzeRoomStep:jest.fn() }));
jest.mock('../src/socket/crossInstance', () => ({ relayEmit:jest.fn((io, kind, target, event, data, options={}) => {
  const sender = options.excludingSocket || io;
  sender.to(target).emit(event, data);
}) }));
const verification = require('../src/services/assessmentVerificationService');
const monitoring = require('../src/services/monitoringService');
const hireProctoring = require('../src/services/hireProctoringService');
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

test('Hire room previews skip workspace inference and one binary capture uses photo analysis', async () => {
  const server = http.createServer();
  const io = new Server(server, { maxHttpBufferSize: 2 * 1024 * 1024 });
  const clients = [];
  let finishPhoto;
  const monitor = { sessionId: 'hire-monitor', metadata: { hireProctoring: {
    policy: { enabled: true, mobileRoomScan: true }, roomScanClear: false,
  } } };
  verification.authorizeSocket.mockImplementation(async ({sessionId}) => ({
    session: { session_id: sessionId, token: 'test-hire-token' },
    monitor,
  }));
  monitoring.validateMobile.mockClear();
  hireProctoring.analyzeRoomStep.mockImplementation(() => new Promise(resolve => { finishPhoto = resolve; }));
  io.on('connection', socket => {
    socket.userId = 7;
    if (socket.handshake.auth.mobile) socket.assessmentMobileClaims = { token: 'test' };
    register(io, socket);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const laptop = connect(url, { transports: ['polling'], forceNew: true }); clients.push(laptop);
    await once(laptop, 'connect');
    await emitAck(laptop, 'assessment_verif:join', { sessionId: 'hire-room', role: 'laptop' });
    const phone = connect(url, { auth: { mobile: true }, transports: ['polling'], forceNew: true }); clients.push(phone);
    await once(phone, 'connect');
    await emitAck(phone, 'assessment_verif:join', { sessionId: 'hire-room', role: 'mobile_camera' });
    const previewFrame = once(laptop, 'assessment_verif:frame');
    expect(await emitAck(phone, 'assessment_verif:frame', { sessionId: 'hire-room', frame: 'preview-only' })).toEqual({ ok: true });
    await previewFrame;
    expect(monitoring.validateMobile).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 550));
    const laterPreview = once(laptop, 'assessment_verif:frame');
    expect(await emitAck(phone, 'assessment_verif:frame', { sessionId: 'hire-room', frame: 'later-room-preview' })).toEqual({ ok: true });
    await laterPreview;
    expect(monitoring.validateMobile).not.toHaveBeenCalled();

    const evidenceRequest = once(laptop, 'assessment_verif:laptop_evidence_request');
    phone.emit('assessment_verif:laptop_evidence_request', { sessionId: 'hire-room', captureId: 'capture-1234' });
    expect(await evidenceRequest).toMatchObject({ captureId: 'capture-1234' });
    const evidenceReply = once(phone, 'assessment_verif:laptop_evidence');
    const laptopFrames = ['data:image/jpeg;base64,QQ==', 'data:image/jpeg;base64,Qg==', 'data:image/jpeg;base64,Qw=='];
    laptop.emit('assessment_verif:laptop_evidence', { sessionId: 'hire-room', captureId: 'capture-1234', frames: laptopFrames });
    expect(await evidenceReply).toMatchObject({ captureId: 'capture-1234', ready: true });
    expect(relay.relayEmit.mock.calls.some(call => call[3] === 'assessment_verif:laptop_evidence')).toBe(false);

    const photo = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(100), Buffer.from([0xff, 0xd9])]);
    const capture = { sessionId: 'hire-room', step: 'front', captureId: 'capture-1234', photo,
      preview: 'data:image/jpeg;base64,QQ==' };
    const analyzing = once(laptop, 'assessment_verif:room_capture_state');
    const first = emitAck(phone, 'assessment_verif:room_capture', capture);
    expect(await analyzing).toMatchObject({ status: 'ANALYZING', step: 'front', preview: capture.preview });
    expect(await emitAck(phone, 'assessment_verif:room_capture', capture)).toMatchObject({ ok: false });
    expect(hireProctoring.analyzeRoomStep).toHaveBeenCalledTimes(1);
    expect(hireProctoring.analyzeRoomStep).toHaveBeenCalledWith(expect.objectContaining({ laptopFrames }));
    const verified = once(laptop, 'assessment_verif:room_capture_state');
    finishPhoto({ valid: true, sixCaptureStatus: { front: { verifiedAt: new Date().toISOString() } } });
    expect(await first).toMatchObject({ ok: true, result: { valid: true } });
    expect(await verified).toMatchObject({ status: 'VERIFIED', step: 'front' });
    hireProctoring.analyzeRoomStep.mockRejectedValue(Object.assign(new Error('AI request timed out'), { code: 'AI_TIMEOUT', status: 504 }));
    const failed = new Promise(resolve => {
      const onState = state => {
        if (state.status === 'ERROR' && state.captureId === 'capture-5678') {
          laptop.off('assessment_verif:room_capture_state', onState);
          resolve(state);
        }
      };
      laptop.on('assessment_verif:room_capture_state', onState);
    });
    const retry = await emitAck(phone, 'assessment_verif:room_capture', { ...capture, step: 'left', captureId: 'capture-5678' });
    expect(retry).toMatchObject({ ok: false, errorCode: 'AI_TIMEOUT' });
    expect(await failed).toMatchObject({ status: 'ERROR', step: 'left', errorCode: 'AI_TIMEOUT' });
    monitor.metadata.hireProctoring.roomScanClear = true;
    monitoring.validateMobile.mockResolvedValue({ success: true, composition_state: 'VALID',
      user_message: 'Hands, laptop, and workspace visible.', mobile_evidence: { framing_mode: 'HIRE_WORKSPACE', eligible: true } });
    await new Promise(resolve => setTimeout(resolve, 550));
    const framingResult = once(laptop, 'assessment_verif:yolo_detection');
    expect(await emitAck(phone, 'assessment_verif:frame', { sessionId: 'hire-room', frame: 'workspace-frame' })).toEqual({ ok: true });
    expect(await framingResult).toMatchObject({ success: true, mobileEvidence: { eligible: true } });
    expect(monitoring.validateMobile).toHaveBeenCalledTimes(1);
  } finally {
    finishPhoto?.({ valid: true });
    clients.forEach(client => client.disconnect());
    await new Promise(resolve => io.close(resolve));
  }
}, 12000);
