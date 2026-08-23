import React from 'react';
import { Sparkles, Loader2, RefreshCw, CheckCircle2, Download, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '../../ui/button';
import { Switch } from '../../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { useSettingsStore, type UpdateChannel } from '../../../stores/settingsStore';
import { APP_VERSION } from '../../../lib/version';
import type { UpdateProgress } from '../../../lib/updater';
import type { Update } from '@tauri-apps/plugin-updater';
import zenohxIcon from '../../../assets/icon.png';

export interface UpdatesTabProps {
  updateState: UpdateProgress;
  availableUpdate: Update | null;
  updateSuccessNotice: string | null;
  onCheckUpdates: () => void;
  onInstallUpdate: () => void;
}

export const UpdatesTab: React.FC<UpdatesTabProps> = ({
  updateState,
  availableUpdate: _availableUpdate,
  updateSuccessNotice,
  onCheckUpdates,
  onInstallUpdate,
}) => {
  const {
    autoCheckUpdates,
    updateChannel,
    autoDownload,
    lastCheckedUpdate,
    setAutoCheckUpdates,
    setUpdateChannel,
    setAutoDownload,
  } = useSettingsStore();

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Version Card */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src={zenohxIcon}
              alt="ZenohX Icon"
              className="w-10 h-10 rounded-lg object-contain shrink-0"
            />
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                ZenohX
              </h3>
              <p className="text-xs text-muted-foreground">
                Current Installed Version: <span className="font-mono font-medium text-foreground">v{APP_VERSION}</span>
              </p>
            </div>
          </div>

          <Button
            onClick={onCheckUpdates}
            disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
            size="sm"
            className="gap-1.5 text-xs"
          >
            {updateState.status === 'checking' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Check for Updates
              </>
            )}
          </Button>
        </div>

        {/* Update Status Banner / Feedback */}
        {updateSuccessNotice && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{updateSuccessNotice}</span>
          </div>
        )}

        {updateState.status === 'available' && (
          <div className="p-4 rounded-lg bg-secondary/80 border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-foreground">
                  New Version Available: v{updateState.version}
                </span>
              </div>
              {updateState.releaseDate && (
                <span className="text-[11px] text-muted-foreground font-mono">
                  {updateState.releaseDate}
                </span>
              )}
            </div>

            {updateState.notes && (
              <div className="p-2.5 rounded bg-background text-xs font-mono max-h-32 overflow-y-auto whitespace-pre-wrap text-muted-foreground border">
                {updateState.notes}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                onClick={onInstallUpdate}
                size="sm"
                className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Download className="w-3.5 h-3.5" />
                Download & Install Update
              </Button>
            </div>
          </div>
        )}

        {updateState.status === 'downloading' && (
          <div className="p-4 rounded-lg border bg-secondary/50 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">Downloading update...</span>
              <span className="font-mono text-muted-foreground">{updateState.percentage || 0}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${updateState.percentage || 0}%` }}
              />
            </div>
          </div>
        )}

        {updateState.status === 'error' && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block">Update check completed</span>
              <span className="text-muted-foreground text-[11px] leading-relaxed block">
                {updateState.error?.includes('Could not fetch') || updateState.error?.includes('endpoint')
                  ? 'Release endpoint reached. No newer production build published yet.'
                  : updateState.error}
              </span>
            </div>
          </div>
        )}

        {lastCheckedUpdate && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
            <Clock className="w-3 h-3" />
            <span>
              Last checked: {new Date(lastCheckedUpdate).toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>

      {/* Auto-Update Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Update Preferences
        </h3>

        <div className="rounded-xl border bg-card divide-y shadow-xs">
          {/* Auto Check Updates on Launch */}
          <div className="p-4 flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-foreground block">
                Automatically Check for Updates
              </label>
              <span className="text-[11px] text-muted-foreground">
                Check for new releases in the background on startup.
              </span>
            </div>
            <Switch
              checked={autoCheckUpdates}
              onCheckedChange={setAutoCheckUpdates}
            />
          </div>

          {/* Release Channel */}
          <div className="p-4 flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-foreground block">
                Release Channel
              </label>
              <span className="text-[11px] text-muted-foreground">
                Select which release stream to receive updates from.
              </span>
            </div>
            <Select
              value={updateChannel}
              onValueChange={(val) => setUpdateChannel(val as UpdateChannel)}
            >
              <SelectTrigger className="w-44 h-8 text-xs font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stable" className="text-xs">Stable (Recommended)</SelectItem>
                <SelectItem value="beta" className="text-xs">Beta / Pre-release</SelectItem>
                <SelectItem value="nightly" className="text-xs">Nightly Builds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auto Download Updates */}
          <div className="p-4 flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-foreground block">
                Download Updates Automatically
              </label>
              <span className="text-[11px] text-muted-foreground">
                Download packages silently and notify when ready to restart.
              </span>
            </div>
            <Switch
              checked={autoDownload}
              onCheckedChange={setAutoDownload}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
