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

import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Play,
  Pause,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useTopologyStore } from '../../stores/topologyStore';

interface TopologyControlsProps {
  onFitToScreen: () => void;
}

export const TopologyControls: React.FC<TopologyControlsProps> = ({ onFitToScreen }) => {
  const zoomIn = useTopologyStore((s) => s.zoomIn);
  const zoomOut = useTopologyStore((s) => s.zoomOut);
  const resetTransform = useTopologyStore((s) => s.resetTransform);
  const isSimulating = useTopologyStore((s) => s.isSimulating);
  const setIsSimulating = useTopologyStore((s) => s.setIsSimulating);
  const transform = useTopologyStore((s) => s.transform);

  return (
    <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 bg-card/90 backdrop-blur-xs border shadow-md rounded-lg p-1">
      <Button
        variant="ghost"
        size="iconSm"
        onClick={zoomIn}
        title="Zoom In"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="iconSm"
        onClick={zoomOut}
        title="Zoom Out"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </Button>

      <div className="text-[10px] font-mono text-center text-muted-foreground py-0.5 select-none">
        {Math.round(transform.k * 100)}%
      </div>

      <div className="h-px bg-border my-0.5" />

      <Button
        variant="ghost"
        size="iconSm"
        onClick={onFitToScreen}
        title="Fit to Screen"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="iconSm"
        onClick={resetTransform}
        title="Reset Camera"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="w-3.5 h-3.5" />
      </Button>

      <div className="h-px bg-border my-0.5" />

      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setIsSimulating(!isSimulating)}
        title={isSimulating ? 'Pause Physics Simulation' : 'Resume Physics Simulation'}
        className={`h-7 w-7 ${isSimulating ? 'text-emerald-500' : 'text-muted-foreground'}`}
      >
        {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </Button>
    </div>
  );
};
