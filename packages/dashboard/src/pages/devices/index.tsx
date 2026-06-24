import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';

import { DeviceListCard } from '../../components/dashboard/device-list-card';
import { PageHeading } from '../../components/layout/page-heading';
import { getDevice } from '../../lib/api';
import { queryKeys } from '../../lib/query';
import type { ConnectedDevice, Theme } from '../../types/dashboard';
import { DeviceDetailsSheet } from './components/device-details-sheet';

export function DevicesPage({ theme, devices }: { theme: Theme; devices: ConnectedDevice[] }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDeviceId = searchParams.get('deviceId');
  const selectedDevice =
    selectedDeviceId == null
      ? null
      : (devices.find((device) => device.id === selectedDeviceId) ?? null);
  const deviceDetailsQuery = useQuery({
    queryKey: queryKeys.device(selectedDevice?.id ?? ''),
    queryFn: () => getDevice(selectedDevice!.id),
    enabled: selectedDevice != null,
  });
  const visibleSelectedDevice = deviceDetailsQuery.data ?? selectedDevice;

  const selectDevice = (device: ConnectedDevice) => {
    setSearchParams(new URLSearchParams({ deviceId: device.id }));
  };

  const closeDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('deviceId');
    setSearchParams(next);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Devices" />

      <DeviceListCard
        title="Devices"
        devices={devices}
        onSelect={selectDevice}
        className="h-[600px]"
        showId
        emptyState={{
          title: 'No devices connected',
        }}
      />

      <DeviceDetailsSheet
        open={visibleSelectedDevice != null}
        onOpenChange={(open) => {
          if (!open) {
            closeDetails();
          }
        }}
        theme={theme}
        device={visibleSelectedDevice}
      />
    </div>
  );
}
