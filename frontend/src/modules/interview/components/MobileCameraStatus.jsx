import { Smartphone, Battery, Wifi, Camera, CameraOff } from 'lucide-react';

export default function MobileCameraStatus({ device }) {
  if (!device) return null;

  const batteryColor = device.batteryLevel > 50 ? 'text-emerald-500' : device.batteryLevel > 20 ? 'text-amber-500' : 'text-red-500';
  const signalColor = device.signalStrength === 'EXCELLENT' || device.signalStrength === 'GOOD' ? 'text-emerald-500' : device.signalStrength === 'FAIR' ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
          <Smartphone size={14} className="text-blue-600" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-900">Mobile Camera</p>
          <p className="text-xs text-slate-500">{device.cameraStatus === 'CONNECTED' ? 'Connected' : 'Disconnected'}</p>
        </div>
        <div className={`ml-auto w-2 h-2 rounded-full ${device.cameraStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-red-500'}`} />
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><Battery size={10} className={batteryColor} /> {device.batteryLevel || '--'}%</span>
        <span className="flex items-center gap-1"><Wifi size={10} className={signalColor} /> {device.signalStrength || 'Unknown'}</span>
        <span className="flex items-center gap-1">{device.cameraStatus === 'CONNECTED' ? <Camera size={10} className="text-emerald-500" /> : <CameraOff size={10} className="text-red-500" />} Camera</span>
      </div>
    </div>
  );
}
