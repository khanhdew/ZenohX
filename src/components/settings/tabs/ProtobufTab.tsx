import React from 'react';
import { ProtoManagerView } from '../../proto/ProtoManagerDialog';

export const ProtobufTab: React.FC = () => {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      <ProtoManagerView isEmbedded />
    </div>
  );
};

export default ProtobufTab;
