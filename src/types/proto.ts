// Copyright 2026 ZenohX Contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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

