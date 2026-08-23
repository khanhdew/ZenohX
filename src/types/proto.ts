import type protobuf from 'protobufjs';

export interface ProtoDefinition {
  id: string;
  name: string;
  rawContent: string;
  syntax: 'proto2' | 'proto3';
  package?: string;
  messageTypes: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ProtoTopicMapping {
  id: string;
  keyPattern: string;
  protoId: string;
  messageTypeName: string;
  createdAt: number;
}

export interface ProtoState {
  schemas: ProtoDefinition[];
  mappings: ProtoTopicMapping[];

  addSchema: (name: string, rawContent: string) => { success: boolean; error?: string; id?: string };
  updateSchema: (id: string, rawContent: string, name?: string) => { success: boolean; error?: string };
  removeSchema: (id: string) => void;

  addMapping: (keyPattern: string, protoId: string, messageTypeName: string) => void;
  removeMapping: (mappingId: string) => void;

  findMappingForKey: (keyExpr: string) => ProtoTopicMapping | undefined;
  getAllMessageTypes: () => Array<{ protoId: string; protoName: string; typeName: string }>;
  getCompiledRoot: (protoId: string) => protobuf.Root | null;
  getGlobalRoot: () => protobuf.Root;
  clearAll: () => void;
}

