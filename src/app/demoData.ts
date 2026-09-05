import type { NicheType, PhotoData, ReportSection, ServiceKind } from '../domain/types';

export interface Vessel {
  imo: string;
  name: string;
  type: string;
  classSociety: string;
  flag: string;
  callSign?: string;
  loa?: string;
  breadth?: string;
  gt?: string;
  dwt?: string;
  yearBuilt?: string;
  ownerClient?: string;
}

export const DEMO_VESSELS: Vessel[] = [
  { imo: '9876543', name: 'M.V. PACIFIC AURORA', type: 'Bulk Carrier', classSociety: 'KR', flag: 'Panama', callSign: '3EAB7', loa: '229.0', breadth: '32.3', gt: '43,000', dwt: '82,000', yearBuilt: '2018', ownerClient: 'Demo Client' },
  { imo: '9234567', name: 'M.T. BLUE HORIZON', type: 'Oil / Chemical Tanker', classSociety: 'DNV', flag: 'Marshall Islands', callSign: 'V7HZ8', loa: '183.0', breadth: '32.2', gt: '29,600', dwt: '47,000', yearBuilt: '2015', ownerClient: 'Demo Client' },
];

export interface ComponentOption {
  name: string;
  defaultType: NicheType;
  defaultQuantity: number;
}

export const COMPONENT_OPTIONS: ComponentOption[] = [
  { name: 'Bulbous Bow', defaultType: 'SIDE', defaultQuantity: 1 },
  { name: 'Bow Thruster', defaultType: 'SIDE', defaultQuantity: 1 },
  { name: 'Bilge Keel', defaultType: 'SIDE', defaultQuantity: 1 },
  { name: 'Sea Chest', defaultType: 'SIDE_QUANTITY', defaultQuantity: 2 },
  { name: 'Discharge Pipe', defaultType: 'SINGLE', defaultQuantity: 1 },
  { name: 'Anode / ICCP', defaultType: 'SIDE', defaultQuantity: 1 },
  { name: 'Transducer', defaultType: 'SINGLE', defaultQuantity: 1 },
  { name: 'Stern Frame', defaultType: 'SINGLE', defaultQuantity: 1 },
  { name: 'Rope Guard', defaultType: 'SINGLE', defaultQuantity: 1 },
  { name: 'Propeller Blade', defaultType: 'QUANTITY', defaultQuantity: 4 },
  { name: 'Boss Cap', defaultType: 'SINGLE', defaultQuantity: 1 },
  { name: 'Rudder & Pintle', defaultType: 'SIDE', defaultQuantity: 1 },
];

export const SERVICES: Array<{ value: ServiceKind; label: string }> = [
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'POLISHING', label: 'Polishing' },
  { value: 'REPAIR', label: 'Repair' },
  { value: 'REMOVAL', label: 'Removal' },
];

const canvasFile = async (name: string, phase: string, color: string): Promise<File> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('샘플 이미지를 만들 수 없습니다.');
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(255,255,255,.18)';
  context.beginPath();
  context.arc(920, 220, 240, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#fff';
  context.font = '700 62px Arial';
  context.fillText(phase, 70, 110);
  context.font = '500 34px Arial';
  context.fillText('UNDERWATER PHOTO · DEMO', 70, 175);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (value) => value ? resolve(value) : reject(new Error('샘플 이미지 생성 실패')),
    'image/jpeg', 0.84,
  ));
  return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
};

export async function createDemoPhotos(section: ReportSection): Promise<PhotoData[]> {
  const sequence = section.phases.length === 1
    ? Array.from({ length: 7 }, () => section.phases[0])
    : ['BEFORE', 'BEFORE', 'BEFORE', 'AFTER', 'AFTER', 'AFTER', 'AFTER'];
  const colors = ['#274c5c', '#315d69', '#3c6872', '#0f766e', '#16857b', '#20948a', '#2aa399'];
  const files = await Promise.all(sequence.map((phase, index) => canvasFile(`DEMO_${String(index + 1).padStart(2, '0')}.jpg`, phase, colors[index])));
  return files.map((file, index) => ({
    id: `DEMO-${Date.now()}-${index}`,
    sectionId: section.id,
    phase: sequence[index] as PhotoData['phase'],
    file,
    reportUse: true,
    order: index + 1,
    relativePath: `DEMO/${file.name}`,
    captionText: '',
  }));
}
