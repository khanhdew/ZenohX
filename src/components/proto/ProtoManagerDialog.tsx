import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileCode2,
  FileCode,
  Upload,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  CheckCircle2,
  Copy,
  Layers,
  Sparkles,
  Link2,
  Search,
  Code,
  Braces,
  Eye,
  Info,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useProtoStore } from '../../stores/protoStore';
import { parseProtoSchema, generateProtoSampleJson } from '../../lib/protobufEngine';
import type { ProtoDefinition, ProtoTopicMapping } from '../../types/proto';

export interface ProtoManagerViewProps {
  isEmbedded?: boolean;
  onClose?: () => void;
  initialSelectedSchemaId?: string;
  initialTab?: 'schemas' | 'mappings';
  className?: string;
}

export interface ProtoManagerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialSelectedSchemaId?: string;
  initialTab?: 'schemas' | 'mappings';
}

export interface ProtoPreset {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const PROTO_PRESETS: ProtoPreset[] = [
  {
    id: 'sensor_msgs',
    name: 'sensor_msgs.proto',
    description: 'Telemetry, battery state, IMU motion data, and temperature sensors',
    content: `syntax = "proto3";

package sensor;

message BatteryState {
  float voltage = 1;
  float current = 2;
  float percentage = 3;
  bool is_charging = 4;
  string power_supply_status = 5;
}

message ImuData {
  int64 timestamp = 1;
  double accel_x = 2;
  double accel_y = 3;
  double accel_z = 4;
  double gyro_x = 5;
  double gyro_y = 6;
  double gyro_z = 7;
}

message TemperatureReading {
  string sensor_id = 1;
  double temperature = 2;
  double humidity = 3;
  int64 timestamp = 4;
}
`,
  },
  {
    id: 'robot_control',
    name: 'robot_control.proto',
    description: 'Robot kinematics, 3D poses, velocity commands, and navigation status',
    content: `syntax = "proto3";

package robot;

message Pose3D {
  double x = 1;
  double y = 2;
  double z = 3;
  double roll = 4;
  double pitch = 5;
  double yaw = 6;
}

message VelocityCommand {
  double linear_x = 1;
  double linear_y = 2;
  double angular_z = 3;
  int64 timestamp = 4;
}

message RobotStatus {
  string robot_id = 1;
  string operational_mode = 2;
  bool emergency_stop = 3;
  Pose3D current_pose = 4;
  int32 battery_level = 5;
}
`,
  },
  {
    id: 'geometry_msgs',
    name: 'geometry_msgs.proto',
    description: 'Spatial 3D vectors, quaternions, transforms, and twist structures',
    content: `syntax = "proto3";

package geometry;

message Vector3 {
  double x = 1;
  double y = 2;
  double z = 3;
}

message Quaternion {
  double x = 1;
  double y = 2;
  double z = 3;
  double w = 4;
}

message Transform {
  Vector3 translation = 1;
  Quaternion rotation = 2;
}

message Twist {
  Vector3 linear = 1;
  Vector3 angular = 2;
}
`,
  },
];

const BLANK_PROTO_TEMPLATE = `syntax = "proto3";

package mypackage;

message SampleMessage {
  string id = 1;
  int64 timestamp = 2;
  double value = 3;
  bool active = 4;
}
`;

/**
 * Basic formatting utility for .proto schemas to ensure clean indentations and structure.
 */
function formatProtoCode(code: string): string {
  const lines = code.split('\n');
  let indentLevel = 0;
  const formattedLines: string[] = [];

  for (let rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      formattedLines.push('');
      continue;
    }

    if (line.startsWith('}') || line.startsWith('};')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    const spaces = '  '.repeat(indentLevel);
    formattedLines.push(`${spaces}${line}`);

    if (line.endsWith('{')) {
      indentLevel++;
    }
  }

  // Clean trailing and consecutive duplicate blank lines
  return formattedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

export const ProtoManagerView: React.FC<ProtoManagerViewProps> = ({
  isEmbedded = false,
  onClose,
  initialSelectedSchemaId,
  initialTab = 'schemas',
  className = '',
}) => {
  const schemas = useProtoStore((s) => s.schemas);
  const mappings = useProtoStore((s) => s.mappings);
  const addSchema = useProtoStore((s) => s.addSchema);
  const updateSchema = useProtoStore((s) => s.updateSchema);
  const removeSchema = useProtoStore((s) => s.removeSchema);
  const addMapping = useProtoStore((s) => s.addMapping);
  const removeMapping = useProtoStore((s) => s.removeMapping);
  const getAllMessageTypes = useProtoStore((s) => s.getAllMessageTypes);
  const getCompiledRoot = useProtoStore((s) => s.getCompiledRoot);

  const [activeTab, setActiveTab] = useState<'schemas' | 'mappings'>(initialTab);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string | null>(null);
  const [schemaSearchQuery, setSchemaSearchQuery] = useState('');

  // Editor states
  const [editorName, setEditorName] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Deletion confirmation
  const [deleteConfirmSchema, setDeleteConfirmSchema] = useState<ProtoDefinition | null>(null);
  const [deleteConfirmMapping, setDeleteConfirmMapping] = useState<ProtoTopicMapping | null>(null);

  // Topic Mapping Form
  const [newMappingPattern, setNewMappingPattern] = useState('');
  const [selectedTargetTypeKey, setSelectedTargetTypeKey] = useState(''); // "protoId:::typeName"
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingSuccessMsg, setMappingSuccessMsg] = useState<string | null>(null);

  // Sample JSON preview modal
  const [samplePreviewModal, setSamplePreviewModal] = useState<{
    typeName: string;
    json: string;
  } | null>(null);
  const [copiedTypeBadge, setCopiedTypeBadge] = useState<string | null>(null);

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync tab & errors on mount
  useEffect(() => {
    setActiveTab(initialTab);
    setEditorError(null);
    setSaveSuccessMsg(null);
    setMappingError(null);
    setMappingSuccessMsg(null);
  }, [initialTab]);

  // Sync selected schema
  useEffect(() => {
    if (initialSelectedSchemaId && schemas.some((s) => s.id === initialSelectedSchemaId)) {
      setSelectedSchemaId(initialSelectedSchemaId);
    } else if (selectedSchemaId && schemas.some((s) => s.id === selectedSchemaId)) {
      // Keep current selection
    } else if (schemas.length > 0) {
      setSelectedSchemaId(schemas[0].id);
    } else {
      setSelectedSchemaId(null);
    }
  }, [schemas, initialSelectedSchemaId]);

  const selectedSchema = useMemo(() => {
    return schemas.find((s) => s.id === selectedSchemaId) || null;
  }, [schemas, selectedSchemaId]);

  // Sync editor fields when selected schema changes
  useEffect(() => {
    if (selectedSchema) {
      setEditorName(selectedSchema.name);
      setEditorContent(selectedSchema.rawContent);
      setEditorError(null);
      setSaveSuccessMsg(null);
    } else {
      setEditorName('');
      setEditorContent('');
      setEditorError(null);
      setSaveSuccessMsg(null);
    }
  }, [selectedSchema?.id]);

  // Live syntax validation of editor content
  const liveValidation = useMemo(() => {
    if (!editorContent || !editorContent.trim()) {
      return { isValid: false, error: 'Schema content cannot be empty', messageTypes: [] };
    }
    try {
      const parsed = parseProtoSchema(editorContent);
      return {
        isValid: true,
        error: null,
        syntax: parsed.syntax,
        package: parsed.package,
        messageTypes: parsed.messageTypes,
      };
    } catch (err: any) {
      return {
        isValid: false,
        error: err?.message || String(err),
        messageTypes: [],
      };
    }
  }, [editorContent]);

  const isDirty = useMemo(() => {
    if (!selectedSchema) return false;
    return (
      editorName.trim() !== selectedSchema.name.trim() ||
      editorContent.trim() !== selectedSchema.rawContent.trim()
    );
  }, [selectedSchema, editorName, editorContent]);

  // All available message types across all schemas for mapping dropdown
  const allMessageTypes = useMemo(() => {
    return getAllMessageTypes();
  }, [schemas, getAllMessageTypes]);

  // Filter schemas
  const filteredSchemas = useMemo(() => {
    const q = schemaSearchQuery.trim().toLowerCase();
    if (!q) return schemas;
    return schemas.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.package && s.package.toLowerCase().includes(q)) ||
        s.messageTypes.some((t) => t.toLowerCase().includes(q))
    );
  }, [schemas, schemaSearchQuery]);

  // Actions
  const handleAddNewBlankSchema = () => {
    const count = schemas.length + 1;
    const name = `schema_${count}.proto`;
    const res = addSchema(name, BLANK_PROTO_TEMPLATE);
    if (res.success && res.id) {
      setSelectedSchemaId(res.id);
      setSaveSuccessMsg('New blank schema created');
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    } else {
      setEditorError(res.error || 'Failed to create new schema');
    }
  };

  const handleLoadPreset = (preset: ProtoPreset) => {
    // Check if a schema with this name already exists
    const existing = schemas.find((s) => s.name === preset.name);
    if (existing) {
      setSelectedSchemaId(existing.id);
      setSaveSuccessMsg(`Switched to existing "${preset.name}"`);
      setTimeout(() => setSaveSuccessMsg(null), 2000);
      return;
    }

    const res = addSchema(preset.name, preset.content);
    if (res.success && res.id) {
      setSelectedSchemaId(res.id);
      setSaveSuccessMsg(`Preset "${preset.name}" loaded successfully`);
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    } else {
      setEditorError(res.error || 'Failed to load preset');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content || !content.trim()) {
        setEditorError('Uploaded file is empty');
        return;
      }

      const fileName = file.name.endsWith('.proto') ? file.name : `${file.name}.proto`;
      const res = addSchema(fileName, content);
      if (res.success && res.id) {
        setSelectedSchemaId(res.id);
        setSaveSuccessMsg(`Uploaded "${fileName}" successfully`);
        setTimeout(() => setSaveSuccessMsg(null), 2500);
      } else {
        setEditorError(res.error || 'Failed to parse uploaded protobuf schema');
      }
    };
    reader.onerror = () => {
      setEditorError('Error reading uploaded file');
    };
    reader.readAsText(file);

    // Reset input so same file can be re-uploaded if desired
    e.target.value = '';
  };

  const handleSaveChanges = () => {
    if (!selectedSchema) return;

    if (!liveValidation.isValid) {
      setEditorError(liveValidation.error || 'Cannot save invalid schema');
      return;
    }

    const res = updateSchema(selectedSchema.id, editorContent, editorName);
    if (res.success) {
      setEditorError(null);
      setSaveSuccessMsg('Schema saved successfully');
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    } else {
      setEditorError(res.error || 'Failed to save schema');
    }
  };

  const handleFormatEditorCode = () => {
    if (!editorContent) return;
    try {
      const formatted = formatProtoCode(editorContent);
      setEditorContent(formatted);
    } catch {
      // Keep original
    }
  };

  const handleConfirmDeleteSchema = () => {
    if (!deleteConfirmSchema) return;
    removeSchema(deleteConfirmSchema.id);
    setDeleteConfirmSchema(null);
    if (selectedSchemaId === deleteConfirmSchema.id) {
      const remaining = schemas.filter((s) => s.id !== deleteConfirmSchema.id);
      setSelectedSchemaId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleCreateMapping = (e: React.FormEvent) => {
    e.preventDefault();
    setMappingError(null);
    setMappingSuccessMsg(null);

    const pattern = newMappingPattern.trim();
    if (!pattern) {
      setMappingError('Zenoh Key Expression pattern cannot be empty');
      return;
    }

    if (!selectedTargetTypeKey) {
      setMappingError('Please select a target Protobuf Message Type');
      return;
    }

    const [protoId, messageTypeName] = selectedTargetTypeKey.split(':::');
    if (!protoId || !messageTypeName) {
      setMappingError('Invalid message type selection');
      return;
    }

    addMapping(pattern, protoId, messageTypeName);
    setNewMappingPattern('');
    setSelectedTargetTypeKey('');
    setMappingSuccessMsg(`Mapped pattern "${pattern}" to ${messageTypeName}`);
    setTimeout(() => setMappingSuccessMsg(null), 3000);
  };

  const handleConfirmDeleteMapping = () => {
    if (!deleteConfirmMapping) return;
    removeMapping(deleteConfirmMapping.id);
    setDeleteConfirmMapping(null);
  };

  const handlePreviewSampleJson = (typeName: string) => {
    if (!selectedSchema) return;
    try {
      const root = getCompiledRoot(selectedSchema.id);
      if (!root) {
        setEditorError(`Unable to compile schema root for ${typeName}`);
        return;
      }
      const sample = generateProtoSampleJson(root, typeName);
      const formattedJson = JSON.stringify(sample, null, 2);
      setSamplePreviewModal({
        typeName,
        json: formattedJson,
      });
    } catch (err: any) {
      setEditorError(`Error generating sample for ${typeName}: ${err?.message || err}`);
    }
  };

  const handleCopyTypeName = (typeName: string) => {
    navigator.clipboard.writeText(typeName).then(() => {
      setCopiedTypeBadge(typeName);
      setTimeout(() => setCopiedTypeBadge(null), 1500);
    });
  };

  // Editor Tab key support
  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newValue = editorContent.substring(0, start) + '  ' + editorContent.substring(end);
      setEditorContent(newValue);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    } else if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSaveChanges();
    }
  };

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden bg-background ${className}`}>
      {/* Header */}
      <div className="px-5 py-3.5 border-b bg-card shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <FileCode2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-2 text-foreground">
              Protobuf Schema Manager
              <Badge variant="outline" className="text-[10px] font-mono font-normal">
                v2 / v3
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Register Protobuf definitions, inspect message types, and map Zenoh topic patterns to automatic decoders.
            </div>
          </div>
        </div>

        {/* Workspace Switcher Tabs */}
        <div className="flex items-center rounded-md bg-muted p-0.5 mr-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('schemas')}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === 'schemas'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Schemas</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                    {schemas.length}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('mappings')}
                  className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === 'mappings'
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Topic Mappings</span>
                  {mappings.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                      {mappings.length}
                    </Badge>
                  )}
                </button>
              </div>
            </div>

          {/* Hidden File Input for .proto file upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".proto,text/plain"
            className="hidden"
          />

          {/* Tab 1: Schemas & Editor */}
          {activeTab === 'schemas' && (
            <div className="flex-1 flex min-h-0 divide-x overflow-hidden">
              {/* Left Column: Schema List & Creation Tools */}
              <div className="w-72 sm:w-80 flex flex-col bg-muted/10 shrink-0 min-h-0">
                {/* Search & Actions Bar */}
                <div className="p-3 border-b space-y-2 shrink-0">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      Loaded Schemas ({filteredSchemas.length})
                    </span>

                    <div className="flex items-center gap-1">
                      {/* Presets Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            title="Load preset sample schemas"
                          >
                            <Sparkles className="w-3 h-3 text-amber-500" />
                            <span>Presets</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 text-xs">
                          <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                            Load Sample Protobuf Schemas
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {PROTO_PRESETS.map((preset) => (
                            <DropdownMenuItem
                              key={preset.id}
                              onClick={() => handleLoadPreset(preset)}
                              className="flex flex-col items-start gap-0.5 py-1.5 cursor-pointer"
                            >
                              <span className="font-medium text-foreground">{preset.name}</span>
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {preset.description}
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {/* Upload Button */}
                      <Button
                        variant="outline"
                        size="iconSm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-7 w-7"
                        title="Upload .proto file"
                      >
                        <Upload className="w-3.5 h-3.5" />
                      </Button>

                      {/* Add Blank Schema Button */}
                      <Button
                        variant="default"
                        size="iconSm"
                        onClick={handleAddNewBlankSchema}
                        className="h-7 w-7"
                        title="Add blank schema"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Schema Search Input */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      value={schemaSearchQuery}
                      onChange={(e) => setSchemaSearchQuery(e.target.value)}
                      placeholder="Filter schemas..."
                      className="h-7 pl-7 text-xs bg-background"
                    />
                    {schemaSearchQuery && (
                      <button
                        onClick={() => setSchemaSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Schemas List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                  {filteredSchemas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center space-y-2 mt-4 border border-dashed rounded-md bg-muted/20">
                      <div className="p-2.5 rounded-full bg-muted text-muted-foreground">
                        <FileCode2 className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-medium">No schemas registered</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Upload a <code className="font-mono text-[10px]">.proto</code> file or load a preset sample to begin.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleLoadPreset(PROTO_PRESETS[0])}
                          className="h-6 text-[11px] px-2 gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          Load Sensor Preset
                        </Button>
                      </div>
                    </div>
                  ) : (
                    filteredSchemas.map((s) => {
                      const isSelected = s.id === selectedSchemaId;
                      return (
                        <div
                          key={s.id}
                          onClick={() => setSelectedSchemaId(s.id)}
                          className={`group rounded-md border p-2 transition-colors cursor-pointer select-none ${
                            isSelected
                              ? 'border-primary/40 bg-background shadow-xs'
                              : 'border-transparent bg-background/50 hover:bg-background/90'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <FileCode className="w-3.5 h-3.5 text-primary shrink-0" />
                                <span
                                  className={`text-xs truncate ${
                                    isSelected ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'
                                  }`}
                                  title={s.name}
                                >
                                  {s.name}
                                </span>
                              </div>

                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 font-mono h-3.5 uppercase"
                                >
                                  {s.syntax}
                                </Badge>
                                {s.package && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1 py-0 font-mono h-3.5 truncate max-w-[120px]"
                                    title={`package ${s.package}`}
                                  >
                                    {s.package}
                                  </Badge>
                                )}
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {s.messageTypes.length} type{s.messageTypes.length === 1 ? '' : 's'}
                                </span>
                              </div>
                            </div>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="iconSm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmSchema(s);
                              }}
                              className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-40 group-hover:opacity-100 transition-opacity"
                              title="Delete schema"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Center / Right Column: Active Schema Viewer & Editor */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-background">
                {selectedSchema ? (
                  <>
                    {/* Top Editor Toolbar */}
                    <div className="px-4 py-2.5 border-b bg-card flex items-center justify-between gap-3 shrink-0">
                      {/* Schema Name Input */}
                      <div className="flex items-center gap-2 flex-1 max-w-md">
                        <span className="text-xs text-muted-foreground shrink-0">Name:</span>
                        <Input
                          value={editorName}
                          onChange={(e) => setEditorName(e.target.value)}
                          placeholder="schema.proto"
                          className="h-7 text-xs font-medium font-mono"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {saveSuccessMsg && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 animate-in fade-in">
                            <Check className="w-3.5 h-3.5" />
                            {saveSuccessMsg}
                          </span>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleFormatEditorCode}
                          className="h-7 px-2.5 text-xs gap-1"
                          title="Format protobuf indentation"
                        >
                          <Code className="w-3.5 h-3.5" />
                          <span>Format</span>
                        </Button>

                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleSaveChanges}
                          disabled={!isDirty || !liveValidation.isValid}
                          className="h-7 px-3 text-xs gap-1 font-medium"
                          title="Save schema changes (Ctrl+S)"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Changes</span>
                        </Button>
                      </div>
                    </div>

                    {/* Syntax Status Bar */}
                    <div className="px-4 py-1.5 border-b bg-muted/20 flex items-center justify-between text-xs shrink-0">
                      <div className="flex items-center gap-2">
                        {liveValidation.isValid ? (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 text-[11px] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Valid {liveValidation.syntax} syntax
                            {liveValidation.package && (
                              <span className="text-muted-foreground font-normal">
                                • package <code className="font-mono">{liveValidation.package}</code>
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-destructive flex items-center gap-1.5 text-[11px] font-medium">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Syntax Error: {liveValidation.error}
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono">
                        {liveValidation.messageTypes.length} message type
                        {liveValidation.messageTypes.length === 1 ? '' : 's'}
                      </div>
                    </div>

                    {/* Global Editor Error Toast/Banner if any */}
                    {editorError && (
                      <div className="mx-4 mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between gap-2 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{editorError}</span>
                        </div>
                        <button
                          onClick={() => setEditorError(null)}
                          className="text-xs font-bold hover:opacity-70"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Textarea Editor */}
                    <div className="flex-1 min-h-0 p-3 flex flex-col relative overflow-hidden">
                      <textarea
                        ref={textareaRef}
                        value={editorContent}
                        onChange={(e) => setEditorContent(e.target.value)}
                        onKeyDown={handleEditorKeyDown}
                        placeholder="// Enter .proto definition here..."
                        spellCheck={false}
                        className="w-full h-full p-3 font-mono text-xs leading-relaxed bg-muted/10 border rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary select-text"
                      />
                    </div>

                    {/* Extracted Message Types Footer List */}
                    <div className="px-4 py-2.5 border-t bg-muted/10 shrink-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-semibold text-foreground">
                            Extracted Message Types
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                            {liveValidation.messageTypes.length}
                          </Badge>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          Click pill to copy full type name or preview sample payload
                        </span>
                      </div>

                      {liveValidation.messageTypes.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic">
                          No valid message types declared in this schema yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {liveValidation.messageTypes.map((type) => {
                            const isCopied = copiedTypeBadge === type;
                            return (
                              <div
                                key={type}
                                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs font-mono shadow-xs hover:border-primary transition-colors"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleCopyTypeName(type)}
                                  className="flex items-center gap-1 text-foreground hover:text-primary"
                                  title="Copy type name"
                                >
                                  {isCopied ? (
                                    <Check className="w-3 h-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-muted-foreground" />
                                  )}
                                  <span>{type}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePreviewSampleJson(type)}
                                  className="text-muted-foreground hover:text-primary pl-1 border-l ml-1"
                                  title="Preview sample JSON payload"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  /* Empty state when no schema selected */
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
                    <div className="p-3 rounded-full bg-muted text-muted-foreground">
                      <FileCode2 className="w-8 h-8" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold">No Schema Selected</h3>
                      <p className="text-xs text-muted-foreground max-w-sm">
                        Select a schema from the left sidebar, upload a new <code className="font-mono text-[10px]">.proto</code> file, or load a preset sample.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        className="h-7 text-xs gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload File</span>
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleAddNewBlankSchema}
                        className="h-7 text-xs gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Schema</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Topic Mapping Rules */}
          {activeTab === 'mappings' && (
            <div className="flex-1 flex flex-col min-h-0 bg-background p-4 overflow-y-auto space-y-4">
              {/* Info Header Banner */}
              <div className="p-3.5 rounded-lg border bg-muted/20 flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0 mt-0.5">
                  <Link2 className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-1 text-xs">
                  <p className="font-semibold text-foreground">Topic-to-Schema Binding Rules</p>
                  <p className="text-muted-foreground leading-relaxed">
                    Zenoh messages published or queried on keys matching these patterns (supports <code className="font-mono text-[10px]">*</code> and <code className="font-mono text-[10px]">**</code> wildcards) will be automatically decoded into clean JSON and structured field trees according to the assigned Protobuf message type.
                  </p>
                </div>
              </div>

              {/* Add New Mapping Form */}
              <form
                onSubmit={handleCreateMapping}
                className="p-4 rounded-lg border bg-card shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Add Topic Mapping Rule
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    e.g. <code className="font-mono text-[10px]">robot/sensors/**</code> → <code className="font-mono text-[10px]">sensor.BatteryState</code>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  {/* Key Pattern Input */}
                  <div className="sm:col-span-6 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Zenoh Key Expression Pattern:
                    </label>
                    <Input
                      value={newMappingPattern}
                      onChange={(e) => setNewMappingPattern(e.target.value)}
                      placeholder="e.g. robot/sensors/** or iot/device/+/status"
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  {/* Target Type Dropdown */}
                  <div className="sm:col-span-4 space-y-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Target Protobuf Message Type:
                    </label>
                    <select
                      value={selectedTargetTypeKey}
                      onChange={(e) => setSelectedTargetTypeKey(e.target.value)}
                      className="h-8 w-full rounded-md border bg-background px-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">-- Select Message Type --</option>
                      {allMessageTypes.map((mt) => (
                        <option
                          key={`${mt.protoId}:::${mt.typeName}`}
                          value={`${mt.protoId}:::${mt.typeName}`}
                        >
                          {mt.typeName} ({mt.protoName})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Submit Button */}
                  <div className="sm:col-span-2 pt-5">
                    <Button
                      type="submit"
                      variant="default"
                      size="sm"
                      className="w-full h-8 text-xs gap-1.5 font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Rule</span>
                    </Button>
                  </div>
                </div>

                {/* Form feedback */}
                {mappingError && (
                  <p className="text-xs text-destructive flex items-center gap-1 pt-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {mappingError}
                  </p>
                )}
                {mappingSuccessMsg && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 pt-1">
                    <Check className="w-3.5 h-3.5" />
                    {mappingSuccessMsg}
                  </p>
                )}
              </form>

              {/* Table of Existing Mappings */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Active Mapping Rules ({mappings.length})
                  </span>
                </div>

                {mappings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 border border-dashed rounded-md bg-muted/10">
                    <div className="p-2.5 rounded-full bg-muted text-muted-foreground">
                      <Link2 className="w-5 h-5" />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-medium">No topic mapping rules configured</p>
                      <p className="text-[11px] text-muted-foreground">
                        Zenoh keys without a mapping will fall back to default raw/JSON decoding.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-md overflow-hidden bg-card">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 border-b text-[11px] font-semibold text-muted-foreground">
                        <tr>
                          <th className="px-3.5 py-2">Zenoh Key Pattern</th>
                          <th className="px-3.5 py-2">Target Message Type</th>
                          <th className="px-3.5 py-2">Schema Source</th>
                          <th className="px-3.5 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {mappings.map((m) => {
                          const schema = schemas.find((s) => s.id === m.protoId);
                          return (
                            <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                              <td className="px-3.5 py-2.5 font-mono font-medium text-foreground">
                                <Badge variant="secondary" className="font-mono text-[11px]">
                                  {m.keyPattern}
                                </Badge>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-primary">
                                {m.messageTypeName}
                              </td>
                              <td className="px-3.5 py-2.5 text-muted-foreground text-[11px]">
                                {schema ? schema.name : 'Unknown Schema'}
                              </td>
                              <td className="px-3.5 py-2.5 text-right">
                                <Button
                                  variant="ghost"
                                  size="iconSm"
                                  onClick={() => setDeleteConfirmMapping(m)}
                                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                  title="Delete mapping rule"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Footer Bar */}
          <div className="px-5 py-3 border-t bg-card shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Info className="w-3.5 h-3.5" />
              <span>
                {schemas.length} schema{schemas.length === 1 ? '' : 's'} registered •{' '}
                {mappings.length} mapping rule{mappings.length === 1 ? '' : 's'} active
              </span>
            </div>

            {!isEmbedded && onClose && (
              <Button variant="outline" size="sm" onClick={onClose} className="h-7 px-3 text-xs">
                Close
              </Button>
            )}
          </div>

      {/* Delete Schema Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmSchema)}
        onOpenChange={(open) => !open && setDeleteConfirmSchema(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Delete Schema?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete schema{' '}
              <strong className="text-foreground">{deleteConfirmSchema?.name}</strong>?
              Any topic mapping rules referencing this schema will also be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmSchema(null)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeleteSchema}
              className="text-xs h-8"
            >
              Delete Schema
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Mapping Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteConfirmMapping)}
        onOpenChange={(open) => !open && setDeleteConfirmMapping(null)}
      >
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Delete Topic Mapping?</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to remove the rule for pattern{' '}
              <code className="font-mono font-bold text-foreground">
                {deleteConfirmMapping?.keyPattern}
              </code>
              ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmMapping(null)}
              className="text-xs h-8"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeleteMapping}
              className="text-xs h-8"
            >
              Delete Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sample JSON Preview Modal */}
      <Dialog
        open={Boolean(samplePreviewModal)}
        onOpenChange={(open) => !open && setSamplePreviewModal(null)}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Braces className="w-4 h-4 text-primary" />
                Sample Payload: {samplePreviewModal?.typeName}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Generated sample template structure for this Protobuf message type.
            </DialogDescription>
          </DialogHeader>

          <div className="my-2">
            <pre className="p-3 bg-muted/40 border rounded-md font-mono text-xs overflow-x-auto max-h-72 select-text leading-relaxed">
              {samplePreviewModal?.json}
            </pre>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (samplePreviewModal) {
                  navigator.clipboard.writeText(samplePreviewModal.json);
                }
              }}
              className="h-7 text-xs gap-1"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy JSON</span>
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => setSamplePreviewModal(null)}
              className="h-7 text-xs"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const ProtoManagerDialog: React.FC<ProtoManagerDialogProps> = ({
  isOpen,
  onClose,
  initialSelectedSchemaId,
  initialTab = 'schemas',
}) => {
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <ProtoManagerView
          onClose={onClose}
          initialSelectedSchemaId={initialSelectedSchemaId}
          initialTab={initialTab}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ProtoManagerDialog;

