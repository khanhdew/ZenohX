import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import protobuf from 'protobufjs';
import type { ProtoDefinition, ProtoState, ProtoTopicMapping } from '../types/proto';
import { parseProtoSchema } from '../lib/protobufEngine';
import { matchesKeyExpr } from '../lib/formatters';

// Runtime in-memory cache for compiled protobuf.Root instances
const rootCache = new Map<string, protobuf.Root>();
let globalRootCache: protobuf.Root | null = null;

function generateId(prefix: string): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${timestamp}-${rand}`;
}

export const useProtoStore = create<ProtoState>()(
  persist(
    (set, get) => ({
      schemas: [],
      mappings: [],

      addSchema: (name: string, rawContent: string) => {
        if (!rawContent || !rawContent.trim()) {
          return { success: false, error: 'Protobuf schema content cannot be empty' };
        }

        try {
          const parsed = parseProtoSchema(rawContent);
          const id = generateId('proto');
          const trimmedName = name && name.trim() ? name.trim() : 'schema.proto';
          const now = Date.now();

          const newSchema: ProtoDefinition = {
            id,
            name: trimmedName,
            rawContent,
            syntax: parsed.syntax,
            package: parsed.package,
            messageTypes: parsed.messageTypes,
            createdAt: now,
            updatedAt: now,
          };

          // Cache the compiled root in memory
          rootCache.set(id, parsed.root);
          globalRootCache = null;

          set((state) => ({
            schemas: [...state.schemas, newSchema],
          }));

          return { success: true, id };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || String(err),
          };
        }
      },

      updateSchema: (id: string, rawContent: string) => {
        const existing = get().schemas.find((s) => s.id === id);
        if (!existing) {
          return { success: false, error: `Protobuf schema with id "${id}" not found` };
        }

        if (!rawContent || !rawContent.trim()) {
          return { success: false, error: 'Protobuf schema content cannot be empty' };
        }

        try {
          const parsed = parseProtoSchema(rawContent);
          const now = Date.now();

          // Update cached root
          rootCache.set(id, parsed.root);
          globalRootCache = null;

          set((state) => ({
            schemas: state.schemas.map((s) =>
              s.id === id
                ? {
                    ...s,
                    rawContent,
                    syntax: parsed.syntax,
                    package: parsed.package,
                    messageTypes: parsed.messageTypes,
                    updatedAt: now,
                  }
                : s
            ),
          }));

          return { success: true };
        } catch (err: any) {
          return {
            success: false,
            error: err?.message || String(err),
          };
        }
      },

      removeSchema: (id: string) => {
        rootCache.delete(id);
        globalRootCache = null;

        set((state) => ({
          schemas: state.schemas.filter((s) => s.id !== id),
          // Cascade deletion: remove mappings referencing this schema
          mappings: state.mappings.filter((m) => m.protoId !== id),
        }));
      },

      addMapping: (keyPattern: string, protoId: string, messageTypeName: string) => {
        const id = generateId('map');
        const newMapping: ProtoTopicMapping = {
          id,
          keyPattern: (keyPattern || '').trim(),
          protoId,
          messageTypeName: (messageTypeName || '').trim(),
          createdAt: Date.now(),
        };

        set((state) => ({
          mappings: [...state.mappings, newMapping],
        }));
      },

      removeMapping: (mappingId: string) => {
        set((state) => ({
          mappings: state.mappings.filter((m) => m.id !== mappingId),
        }));
      },

      findMappingForKey: (keyExpr: string) => {
        if (!keyExpr || !keyExpr.trim()) {
          return undefined;
        }

        const cleanKey = keyExpr.trim();
        const mappings = get().mappings;
        const matching = mappings.filter((m) => matchesKeyExpr(m.keyPattern, cleanKey));

        if (matching.length === 0) return undefined;
        if (matching.length === 1) return matching[0];

        // Specificity ranking:
        // 1. Exact match (m.keyPattern === cleanKey)
        // 2. Single '*' wildcard over recursive '**'
        // 3. Longest literal prefix before first wildcard
        // 4. Longest keyPattern length
        return matching.slice().sort((a, b) => {
          if (a.keyPattern === cleanKey && b.keyPattern !== cleanKey) return -1;
          if (b.keyPattern === cleanKey && a.keyPattern !== cleanKey) return 1;

          const aHasDoubleStar = a.keyPattern.includes('**');
          const bHasDoubleStar = b.keyPattern.includes('**');
          if (!aHasDoubleStar && bHasDoubleStar) return -1;
          if (aHasDoubleStar && !bHasDoubleStar) return 1;

          const aPrefix = a.keyPattern.split('*')[0].length;
          const bPrefix = b.keyPattern.split('*')[0].length;
          if (aPrefix !== bPrefix) return bPrefix - aPrefix;

          return b.keyPattern.length - a.keyPattern.length;
        })[0];
      },

      getAllMessageTypes: () => {
        const schemas = get().schemas;
        const result: Array<{ protoId: string; protoName: string; typeName: string }> = [];

        for (const schema of schemas) {
          for (const typeName of schema.messageTypes) {
            result.push({
              protoId: schema.id,
              protoName: schema.name,
              typeName,
            });
          }
        }

        return result;
      },

      getCompiledRoot: (protoId: string) => {
        if (rootCache.has(protoId)) {
          return rootCache.get(protoId)!;
        }

        const schema = get().schemas.find((s) => s.id === protoId);
        if (!schema) {
          return null;
        }

        try {
          const parsed = parseProtoSchema(schema.rawContent);
          rootCache.set(protoId, parsed.root);
          return parsed.root;
        } catch {
          return null;
        }
      },

      getGlobalRoot: () => {
        if (globalRootCache) {
          return globalRootCache;
        }

        const globalRoot = new protobuf.Root();
        const schemas = get().schemas;

        for (const schema of schemas) {
          try {
            protobuf.parse(schema.rawContent, globalRoot, {
              keepCase: true,
              alternateCommentMode: true,
            });
          } catch {
            // Continue compiling other valid schemas
          }
        }

        try {
          globalRoot.resolveAll();
        } catch {
          // Ignore external unresolved imports
        }

        globalRootCache = globalRoot;
        return globalRoot;
      },

      clearAll: () => {
        rootCache.clear();
        globalRootCache = null;
        set({ schemas: [], mappings: [] });
      },
    }),
    {
      name: 'zenohx-proto-schemas',
      partialize: (state) => ({
        schemas: state.schemas,
        mappings: state.mappings,
      }),
      onRehydrateStorage: () => () => {
        rootCache.clear();
        globalRootCache = null;
      },
    }
  )
);
