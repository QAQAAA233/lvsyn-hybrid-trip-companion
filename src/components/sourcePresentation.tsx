import type { ReactNode } from 'react';
import { InferenceSource } from 'firebase/ai';
import { Clock, Cloud, Cpu, Download, ShieldAlert, X } from 'lucide-react';
import type { TripProposal } from '../domain/proposal';

/** Semantic tone shared by every badge, chip, stat and route node (see index.css). */
export type Tone = 'neutral' | 'device' | 'cloud' | 'guard' | 'danger' | 'ok';

/** Where one AI run ended up, as the traveler should read it. */
export type RouteState = 'idle' | 'running' | 'device' | 'cloud' | 'emulator' | 'blocked' | 'unverified' | 'failed';

export interface SourceView {
  route: RouteState;
  tone: Tone;
  label: string;
  icon: ReactNode;
  confirmed: boolean;
}

const iconCls = 'h-3.5 w-3.5';

/**
 * Single presentation rule for "where did this run execute". Only reads the proposal's
 * terminal telemetry; the decision of what counts as SDK-confirmed stays in the domain.
 */
export function describeProposalSource(p: TripProposal): SourceView {
  const source = p.telemetry.actualSource;
  const completedBySdk = p.telemetry.sourceEvidence === 'sdk_terminal_response' && Boolean(p.responseText.trim());
  const isOnDevice = completedBySdk && source === InferenceSource.ON_DEVICE;
  const isCloud = completedBySdk && source === InferenceSource.IN_CLOUD;
  const isEmulator = completedBySdk && source === 'local_emulator';
  const isBlocked = source === 'blocked_offline_privacy';
  const isError = p.status === 'error';
  const confirmed = isOnDevice || isCloud || isEmulator;

  if (p.status === 'streaming') return { route: 'running', tone: 'neutral', confirmed: false,
    label: 'RUNNING · Source not yet confirmed', icon: <Clock className={iconCls} /> };
  if (p.errorMessage === 'REQ211_NANO_DOWNLOAD_REQUIRED') return { route: 'blocked', tone: 'guard', confirmed: false,
    label: 'DOWNLOAD REQUIRED · Click Enable On-Device AI', icon: <Download className={iconCls} /> };
  if (source === 'source_unverified') return { route: 'unverified', tone: 'guard', confirmed: false,
    label: 'SOURCE UNVERIFIED · Result not used', icon: <ShieldAlert className={iconCls} /> };
  if (isBlocked) return { route: 'blocked', tone: 'guard', confirmed: false,
    label: 'BLOCKED BEFORE DISPATCH · Privacy Shield (0 bytes sent)', icon: <ShieldAlert className={iconCls} /> };
  if (isError) return { route: 'failed', tone: 'danger', confirmed: false,
    label: 'NO COMPLETED MODEL RESULT', icon: <X className={iconCls} /> };
  if (isOnDevice) return { route: 'device', tone: 'device', confirmed,
    label: 'ON-DEVICE · inferenceSource: "on_device"', icon: <Cpu className={iconCls} /> };
  if (isEmulator) return { route: 'emulator', tone: 'neutral', confirmed,
    label: 'LOCAL EMULATOR · inferenceSource: "local_emulator"', icon: <Cpu className={iconCls} /> };
  if (isCloud) return { route: 'cloud', tone: 'cloud', confirmed,
    label: 'IN-CLOUD · inferenceSource: "in_cloud"', icon: <Cloud className={iconCls} /> };
  return { route: 'unverified', tone: 'guard', confirmed: false,
    label: 'SOURCE UNVERIFIED · Result not used', icon: <ShieldAlert className={iconCls} /> };
}

/** Tone for a raw telemetry source string (telemetry table). */
export function toneForSource(source: string): Tone {
  if (source === InferenceSource.ON_DEVICE) return 'device';
  if (source === InferenceSource.IN_CLOUD) return 'cloud';
  return 'guard';
}

export function Chip({ tone = 'neutral', className = '', children, ...rest }:
  { tone?: Tone; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={`chip tone-${tone} ${className}`} {...rest}>{children}</span>;
}
