import React, { useState } from 'react';
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
  AlertCircle,
  Loader2,
  RefreshCw,
  Zap,
  Radio,
  Server,
  FolderOpen,
  Lock,
  ExternalLink,
  Link,
  Check,
  FileCode2,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useProtoStore } from '../../stores/protoStore';
import { ConnectionProfile } from '../../types/zenoh';
import { isTlsEnabled, isEphemeralLocator } from '../../lib/tls';
import { openProfileInNewWindow } from '../../lib/tauri';
import { formatFriendlyError } from '../../lib/errorUtils';
import { ProfileModal } from './ProfileModal';
import { ScoutModal } from './ScoutModal';
import { BoundLocatorBadge } from './BoundLocatorBadge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../ui/context-menu';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface SidebarProps {
  className?: string;
  style?: React.CSSProperties;
  onSelectProfile?: (profile: ConnectionProfile) => void;
}

export function Sidebar({ className = '', style, onSelectProfile }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [scoutModalOpen, setScoutModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | null>(null);
  const [deleteConfirmProfile, setDeleteConfirmProfile] = useState<ConnectionProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedLocatorProfileId, setCopiedLocatorProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store state
  const profiles = useConnectionStore((s) => s.profiles);
  const protoSchemas = useProtoStore((s) => s.schemas);
  const selectedProfileId = useConnectionStore((s) => s.selectedProfileId);
  const activeSessions = useConnectionStore((s) => s.activeSessions);
  const connectingProfileIds = useConnectionStore((s) => s.connectingProfileIds);
  const isLoadingProfiles = useConnectionStore((s) => s.isLoadingProfiles);

  // Store actions
  const selectProfile = useConnectionStore((s) => s.selectProfile);
  const connect = useConnectionStore((s) => s.connect);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const deleteProfile = useConnectionStore((s) => s.deleteProfile);
  const saveProfile = useConnectionStore((s) => s.saveProfile);
  const loadProfiles = useConnectionStore((s) => s.loadProfiles);

  // Filter profiles based on search input
  const filteredProfiles = profiles.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const matchesName = p.name.toLowerCase().includes(q);
    const matchesMode = p.mode.toLowerCase().includes(q);
    const matchesLocators = (p.connect_locators || []).some((loc) =>
      loc.toLowerCase().includes(q)
    );
    return matchesName || matchesMode || matchesLocators;
  });

  const activeCount = Object.keys(activeSessions).length;

  const handleOpenNewProfile = () => {
    setEditingProfile(null);
    setProfileModalOpen(true);
  };

  const handleOpenInNewWindow = async (p: ConnectionProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await openProfileInNewWindow(p);
    } catch (err) {
      setError(formatFriendlyError(err, 'Open Window').fullMessage);
    }
  };

  const handleCopyLocator = (p: ConnectionProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const sess = activeSessions[p.id];
    const locators =
      sess?.bound_locators && sess.bound_locators.length > 0
        ? sess.bound_locators.join(', ')
        : p.connect_locators && p.connect_locators.length > 0
        ? p.connect_locators.join(', ')
        : p.scout_multicast
        ? 'Multicast'
        : `${p.mode || 'peer'} (local)`;
    navigator.clipboard.writeText(locators);
    setCopiedLocatorProfileId(p.id);
    setTimeout(() => setCopiedLocatorProfileId((curr) => (curr === p.id ? null : curr)), 2000);
  };

  const handleEditProfile = (p: ConnectionProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingProfile(p);
    setProfileModalOpen(true);
  };

  const handleDuplicateProfile = async (p: ConnectionProfile, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const now = Math.floor(Date.now() / 1000);
      const duplicated: ConnectionProfile = {
        ...p,
        id: crypto.randomUUID ? crypto.randomUUID() : `profile-${Date.now()}`,
        name: `${p.name} (Copy)`,
        created_at: now,
        updated_at: now,
      };
      await saveProfile(duplicated);
      selectProfile(duplicated.id);
    } catch (err) {
      setError(formatFriendlyError(err, 'Duplicate Profile').fullMessage);
    }
  };

  const handleToggleConnect = async (profileId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setError(null);
    const isConnected = Boolean(activeSessions[profileId]);
    try {
      if (isConnected) {
        await disconnect(profileId);
      } else {
        await connect(profileId);
      }
    } catch (err) {
      setError(formatFriendlyError(err, 'Connection Failed').fullMessage);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmProfile) return;
    try {
      setIsDeleting(true);
      setError(null);
      await deleteProfile(deleteConfirmProfile.id);
      setIsDeleting(false);
      setDeleteConfirmProfile(null);
    } catch (err) {
      setIsDeleting(false);
      setError(formatFriendlyError(err, 'Delete Profile').fullMessage);
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
      style={style}
      className={`flex flex-col h-full shrink-0 border-r bg-card text-card-foreground select-none ${className}`}
    >
      {/* Top Header */}
      <div className="p-3 border-b space-y-2.5">
        {/* Title & Stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground">Connections</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
              {activeCount} active
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            {/* Scout LAN Button */}
            <Button
              variant="outline"
              size="iconSm"
              onClick={() => setScoutModalOpen(true)}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Scout local network (Multicast)"
            >
              <Radar className="w-3.5 h-3.5" />
            </Button>

            {/* New Connection Button */}
            <Button
              variant="default"
              size="sm"
              onClick={handleOpenNewProfile}
              className="h-7 px-2 text-xs gap-1"
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
            placeholder="Search..."
            className="h-7 pl-7 text-xs bg-muted/30"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="m-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 flex items-start justify-between gap-2 text-xs text-destructive">
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
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {isLoadingProfiles ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-xs">Loading connections...</span>
          </div>
        ) : filteredProfiles.length === 0 ? (
          /* Empty List State */
          <div className="flex flex-col items-center justify-center text-center p-5 space-y-2.5 mt-4 border border-dashed rounded-md bg-muted/20">
            <div className="p-2.5 rounded-full bg-muted text-muted-foreground">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-medium">
                {searchQuery ? 'No matching connections' : 'No connections configured'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {searchQuery
                  ? 'Try a different search term.'
                  : 'Create a profile or scout your local network.'}
              </p>
            </div>
            {!searchQuery && (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setScoutModalOpen(true)}
                  className="h-6 px-2 text-xs gap-1"
                >
                  <Radar className="w-3 h-3" />
                  Scout
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleOpenNewProfile}
                  className="h-6 px-2 text-xs gap-1"
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
            const isLocatorCopied = copiedLocatorProfileId === p.id;

            // Mode icon
            const mode = (p.mode || 'peer').toLowerCase();
            const ModeIcon = mode === 'router' ? Server : mode === 'client' ? Radio : Zap;

            // Locator preview
            const locatorPreview =
              p.connect_locators && p.connect_locators.length > 0
                ? p.connect_locators[0]
                : p.scout_multicast
                ? 'Multicast'
                : 'Local Peer';

            return (
              <ContextMenu key={p.id}>
                <ContextMenuTrigger asChild>
                  <div
                    onClick={() => handleSelect(p)}
                    className={`group rounded-md border p-2 transition-colors cursor-pointer select-none ${
                      isSelected
                        ? 'border-foreground/30 bg-muted/60'
                        : 'border-transparent hover:bg-muted/40'
                    }`}
                  >
                    {/* Top Row: Status Dot, Name, Action Controls */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Status Dot */}
                        <div className="relative flex items-center justify-center shrink-0">
                          {isConnecting ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                          ) : isConnected ? (
                            <span className="inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          ) : (
                            <span className="inline-flex rounded-full h-1.5 w-1.5 bg-muted-foreground/30"></span>
                          )}
                        </div>

                        {/* Name */}
                        <span
                          className={`text-xs truncate ${
                            isSelected
                              ? 'font-semibold text-foreground'
                              : 'font-medium text-foreground/90'
                          }`}
                          title={p.name}
                        >
                          {p.name}
                        </span>
                      </div>

                      {/* Right Actions: Connect/Disconnect toggle + Context Dropdown */}
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Quick Connect / Disconnect Button */}
                        <Button
                          type="button"
                          variant={isConnected ? 'destructive' : 'ghost'}
                          size="iconSm"
                          onClick={(e) => handleToggleConnect(p.id, e)}
                          disabled={isConnecting}
                          className="h-5 w-5 rounded p-0"
                          title={
                            isConnecting
                              ? 'Connecting...'
                              : isConnected
                              ? 'Disconnect session'
                              : 'Connect session'
                          }
                        >
                          {isConnecting ? (
                            <Loader2 className="w-3 h-3 animate-spin text-amber-500" />
                          ) : isConnected ? (
                            <PowerOff className="w-3 h-3" />
                          ) : (
                            <Power className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                          )}
                        </Button>

                        {/* More Menu Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="iconSm"
                              className="h-5 w-5 rounded p-0 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100"
                              title="More options"
                            >
                              <MoreVertical className="w-3 h-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem onClick={(e) => handleOpenInNewWindow(p, e)}>
                              <ExternalLink className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              <span>Open in New Window</span>
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
                            <DropdownMenuItem onClick={(e) => handleEditProfile(p, e)}>
                              <Pencil className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              <span>Edit Profile...</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleDuplicateProfile(p, e)}>
                              <Copy className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              <span>Duplicate</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleCopyLocator(p, e)}>
                              {isLocatorCopied ? (
                                <Check className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                              ) : (
                                <Link className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                              )}
                              <span>Copy Locator(s)</span>
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
                              <span>Delete Profile...</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Subtitle / Details Row */}
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      {/* Mode Badge, SSL Badge & Locator Info */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1 py-0 h-3.5 capitalize font-mono"
                        >
                          <ModeIcon className="w-2.5 h-2.5 mr-0.5 inline-block" />
                          {mode}
                        </Badge>
                        {isTlsEnabled(p.tls_config, p.connect_locators) && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-3.5 font-mono gap-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            title="TLS / SSL Encrypted Connection"
                          >
                            <Lock className="w-2.5 h-2.5 inline-block" />
                            SSL
                          </Badge>
                        )}
                        <span className="truncate font-mono" title={locatorPreview}>
                          {locatorPreview}
                        </span>
                      </div>

                      {/* Connected ZID pill or locators count */}
                      {isConnected && session?.zid ? (
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded shrink-0">
                          {session.zid.slice(0, 6)}
                        </span>
                      ) : (
                        p.connect_locators &&
                        p.connect_locators.length > 1 && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            +{p.connect_locators.length - 1}
                          </span>
                        )
                      )}
                    </div>

                    {/* Bound Locators Row (When connected with active bound listening endpoints) */}
                    {isConnected && session?.bound_locators && session.bound_locators.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-border/40 flex flex-wrap items-center gap-1">
                        {session.bound_locators.map((loc) => {
                          const isAuto = isEphemeralLocator(loc, p.listen_locators);
                          return (
                            <BoundLocatorBadge
                              key={loc}
                              locator={loc}
                              isAutoPort={isAuto}
                              size="xs"
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </ContextMenuTrigger>

                {/* Right-click Context Menu */}
                <ContextMenuContent className="w-48 text-xs">
                  <ContextMenuItem onClick={(e) => handleOpenInNewWindow(p, e)}>
                    <ExternalLink className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span>Open in New Window</span>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={(e) => handleToggleConnect(p.id, e)}>
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
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={(e) => handleEditProfile(p, e)}>
                    <Pencil className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span>Edit Profile...</span>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={(e) => handleDuplicateProfile(p, e)}>
                    <Copy className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    <span>Duplicate</span>
                  </ContextMenuItem>
                  <ContextMenuItem onClick={(e) => handleCopyLocator(p, e)}>
                    {isLocatorCopied ? (
                      <Check className="w-3.5 h-3.5 mr-2 text-emerald-500" />
                    ) : (
                      <Link className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                    )}
                    <span>Copy Locator(s)</span>
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmProfile(p);
                    }}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                    <span>Delete Profile...</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })
        )}
      </div>

      {/* Bottom Footer */}
      <div className="p-2.5 border-t flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <span>
            {profiles.length} profile{profiles.length === 1 ? '' : 's'}
          </span>
          {protoSchemas.length > 0 && (
            <>
              <span className="text-muted-foreground/40">•</span>
              <span className="flex items-center gap-1 text-muted-foreground" title="Protobuf Schemas (Settings > Protobuf Manager)">
                <FileCode2 className="w-3 h-3" />
                <span>{protoSchemas.length} proto{protoSchemas.length === 1 ? '' : 's'}</span>
              </span>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => loadProfiles()}
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
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

      {/* Scout Modal */}
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
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmProfile(null);
        }}
      >
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Delete Profile?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete profile{' '}
              <strong className="text-foreground">{deleteConfirmProfile?.name}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmProfile(null)}
              disabled={isDeleting}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="text-xs h-8"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

export default Sidebar;
