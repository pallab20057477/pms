import React from 'react';
import { Oval } from 'react-loader-spinner';

function Preloader() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(255, 255, 255, 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
    }}>
      <Oval
        height={60}
        width={60}
        color="#3b82f6"
        secondaryColor="#bfdbfe"
        strokeWidth={4}
        strokeWidthSecondary={4}
        visible={true}
        ariaLabel="oval-loading"
      />
    </div>
  );
}

export default Preloader;
