import { DeviceListCard } from '../../../components/dashboard/device-list-card';
import type { ConnectedDevice } from '../../../types/dashboard';

export function ConnectedDevices({
  devices,
  onSelect,
}: {
  devices: ConnectedDevice[];
  onSelect: (device: ConnectedDevice) => void;
}) {
  return (
    <DeviceListCard
      title="Connected Devices"
      devices={devices}
      onSelect={onSelect}
      className="h-[260px]"
    />
  );
}
