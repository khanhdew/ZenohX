import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Radar,
  Search,
  Power,
  PowerOff,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Radio,
  Server,
  Zap,
  AlertCircle,
  Loader2,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { useConnectionStore } from '../../stores/connectionStore';
import type { ConnectionProfile } from '../../types/zenoh';
import { ProfileModal } from './ProfileModal';
import { ScoutModal } from './ScoutModal';

export interface SidebarProps {
  className?: string;
  onSelectProfile?: (profile: ConnectionProfile) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ className = '', onSelectProfile }) => {
  const {
    profiles,
    selectedProfileId,
    activeSessions,
    connectingProfileIds,
    isLoadingProfiles,
    error,
    loadProfiles,
    selectProfile,
    saveProfile,
    deleteProfile,
    connect,
    disconnect,
    setError,
  } = useConnectionStore();

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [scoutModalOpen, setScoutModalOpen] = useState<boolean>(false);

  // Delete confirmation state
  const [deleteConfirmProfile, setDeleteConfirmProfile] = useState<ConnectionProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load profiles on mount
  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  // Filter profiles based on search
  const filteredProfiles = useMemo(() => {
    if (!searchQuery.trim()) return profiles;
    const q = searchQuery.toLowerCase().trim();
    return profiles.filter((p) => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchMode = p.mode.toLowerCase().includes(q);
      const matchLocators = p.connect_locators?.some((l) => l.toLowerCase().includes(q));
      return matchName || matchMode || matchLocators;
    });
  }, [profiles, searchQuery]);

  // Active connected profiles count
  const activeCount = Object.keys(activeSessions).length;

  // Actions
  const handleOpenNewProfile = () => {
    setEditingProfile(null);
    setProfileModalOpen(true);
  };

  const handleEditProfile = (p: ConnectionProfile, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingProfile(p);
    setProfileModalOpen(true);
  };

  const handleDuplicateProfile = async (p: ConnectionProfile, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const now = Date.now();
      const duplicate: ConnectionProfile = {
        ...p,
        id: crypto.randomUUID(),
        name: `${p.name} (Copy)`,
        created_at: now,
        updated_at: now,
      };
      await saveProfile(duplicate);
      selectProfile(duplicate.id);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleToggleConnect = async (profileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const isConnected = Boolean(activeSessions[profileId]);
    const isConnecting = Boolean(connectingProfileIds[profileId]);

    if (isConnecting) return;

    try {
      if (isConnected) {
        await disconnect(profileId);
      } else {
        await connect(profileId);
      }
    } catch (err) {
      // Error handled by store
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmProfile) return;
    setIsDeleting(true);
    try {
      await deleteProfile(deleteConfirmProfile.id);
      setIsDeleting(false);
      setDeleteConfirmProfile(null);
    } catch (err) {
      setIsDeleting(false);
      setError(String(err));
    }
  };

  const handleSelect = (p: ConnectionProfile) => {
    selectProfile(p.id);
    if (onSelectProfile) {
      onSelectProfile(p);
    }
  };

  return (
    <aside
      className={`flex flex-col h-full w-80 shrink-0 border-r bg-card text-card-foreground select-none ${className}`}
    >
      {/* Top Header */}
      <div className="p-3.5 border-b bg-muted/20 space-y-3">
        {/* Title & Stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm tracking-tight text-foreground">Connections</span>
            <Badge
              variant={activeCount > 0 ? 'success' : 'secondary'}
              className="text-[10px] px-1.5 py-0 font-mono"
            >
              {activeCount} active
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {/* Scout LAN Button */}
            <Button
              variant="outline"
              size="iconSm"
              onClick={() => setScoutModalOpen(true)}
              className="h-7 w-7 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"
              title="Scout local network (Multicast)"
            >
              <Radar className="w-3.5 h-3.5" />
            </Button>

            {/* New Connection Button */}
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenNewProfile}
              className="h-7 px-2 text-xs gap-1 shadow-sm"
              title="Add new Zenoh connection profile"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search connections..."
            className="h-8 pl-8 text-xs bg-background/80"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="m-2 p-2.5 rounded-md bg-destructive/15 border border-destructive/30 flex items-start justify-between gap-2 text-xs text-destructive">
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs font-bold hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Connection List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoadingProfiles ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Loading connections...</span>
          </div>
        ) : filteredProfiles.length === 0 ? (
          /* Empty List State */
          <div className="flex flex-col items-center justify-center text-center p-6 space-y-3 mt-6 border border-dashed rounded-lg bg-muted/10">
            <div className="p-3 rounded-full bg-muted text-muted-foreground">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium">
                {searchQuery ? 'No matching connections' : 'No connections configured'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {searchQuery
                  ? 'Try a different search term.'
                  : 'Create a connection profile or scout your local network.'}
              </p>
            </div>
            {!searchQuery && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScoutModalOpen(true)}
                  className="h-7 text-xs gap-1"
                >
                  <Radar className="w-3 h-3 text-blue-500" />
                  Scout LAN
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleOpenNewProfile}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Create
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* List Items */
          filteredProfiles.map((p) => {
            const isSelected = p.id === selectedProfileId;
            const session = activeSessions[p.id];
            const isConnected = Boolean(session);
            const isConnecting = Boolean(connectingProfileIds[p.id]);

            // Mode icon & styling
            const mode = (p.mode || 'peer').toLowerCase();
            const ModeIcon = mode === 'router' ? Server : mode === 'client' ? Radio : Zap;

            // Locator preview
            const locatorPreview =
              p.connect_locators && p.connect_locators.length > 0
                ? p.connect_locators[0]
                : p.scout_multicast
                ? 'Multicast Discovery'
                : 'Local Peer';

            return (
              <div
                key={p.id}
                onClick={() => handleSelect(p)}
                className={`group relative rounded-lg border p-2.5 transition-all cursor-pointer ${
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-muted-foreground/30 hover:bg-muted/40'
                }`}
              >
                {/* Active Indicator Bar on Left */}
                {isSelected && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 bg-primary rounded-r" />
                )}

                {/* Top Row: Status Dot, Name, Action Controls */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Status Dot */}
                    <div className="relative flex items-center justify-center shrink-0">
                      {isConnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      ) : isConnected ? (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/40"></span>
                      )}
                    </div>

                    {/* Name */}
                    <span
                      className={`text-xs font-semibold truncate ${
                        isSelected ? 'text-foreground font-bold' : 'text-foreground/90'
                      }`}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                  </div>

                  {/* Right Actions: Connect/Disconnect toggle + Context Dropdown */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Quick Connect / Disconnect Button */}
                    <Button
                      type="button"
                      variant={isConnected ? 'destructive' : isConnecting ? 'secondary' : 'ghost'}
                      size="iconSm"
                      onClick={(e) => handleToggleConnect(p.id, e)}
                      disabled={isConnecting}
                      className={`h-6 w-6 rounded p-0 transition-colors ${
                        isConnected
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground'
                          : 'text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10'
                      }`}
                      title={
                        isConnecting
                          ? 'Connecting...'
                          : isConnected
                          ? 'Disconnect session'
                          : 'Connect session'
                      }
                    >
                      {isConnecting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isConnected ? (
                        <PowerOff className="w-3 h-3" />
                      ) : (
                        <Power className="w-3 h-3" />
                      )}
                    </Button>

                    {/* More Menu Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="h-6 w-6 rounded p-0 text-muted-foreground hover:text-foreground"
                          title="More options"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40 text-xs">
                        <DropdownMenuItem onClick={(e) => handleEditProfile(p, e)}>
                          <Pencil className="w-3.5 h-3.5 mr-2" />
                          Edit Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleDuplicateProfile(p, e)}>
                          <Copy className="w-3.5 h-3.5 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => handleToggleConnect(p.id, e)}>
                          {isConnected ? (
                            <>
                              <PowerOff className="w-3.5 h-3.5 mr-2 text-destructive" />
                              <span className="text-destructive">Disconnect</span>
                            </>
                          ) : (
                            <>
                              <Power className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                              <span>Connect</span>
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmProfile(p);
                          }}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete Profile
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Subtitle / Details Row */}
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                  {/* Mode Badge & Locator Info */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    <Badge
                      variant={
                        mode === 'router'
                          ? 'purple'
                          : mode === 'client'
                          ? 'success'
                          : 'info'
                      }
                      className="text-[9px] px-1 py-0 h-4 capitalize font-normal"
                    >
                      <ModeIcon className="w-2.5 h-2.5 mr-0.5 inline-block" />
                      {mode}
                    </Badge>
                    <span className="truncate font-mono text-[10px]" title={locatorPreview}>
                      {locatorPreview}
                    </span>
                  </div>

                  {/* Connected ZID pill or locators count */}
                  {isConnected && session?.zid ? (
                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 rounded shrink-0">
                      {session.zid.slice(0, 6)}…
                    </span>
                  ) : (
                    p.connect_locators && p.connect_locators.length > 1 && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        +{p.connect_locators.length - 1} more
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Footer */}
      <div className="p-3 border-t bg-muted/20 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {profiles.length} profile{profiles.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => loadProfiles()}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          title="Reload profiles"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>

      {/* Profile Modal (Create / Edit) */}
      <ProfileModal
        isOpen={profileModalOpen}
        onClose={() => {
          setProfileModalOpen(false);
          setEditingProfile(null);
        }}
        profile={editingProfile}
      />

      {/* Scout Modal (Multicast Discovery) */}
      <ScoutModal
        isOpen={scoutModalOpen}
        onClose={() => setScoutModalOpen(false)}
        onOpenProfileEditor={(newProf) => {
          setEditingProfile(newProf);
          setProfileModalOpen(true);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmProfile)}
        onOpenChange={(open) => !open && setDeleteConfirmProfile(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              Delete Connection Profile
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete profile{' '}
              <strong className="text-foreground font-semibold">
                "{deleteConfirmProfile?.name}"
              </strong>
              ? If currently connected, this will disconnect the active session. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmProfile(null)}
              disabled={isDeleting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="text-xs"
            >
              {isDeleting ? 'Deleting...' : 'Delete Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
};

export default Sidebar;
