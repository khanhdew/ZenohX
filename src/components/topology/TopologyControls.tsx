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
