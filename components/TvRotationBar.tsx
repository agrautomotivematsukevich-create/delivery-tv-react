import React from 'react';

type Props = {
  durationMs: number;
  // Bumped on every screen switch; remounting the fill restarts the CSS animation.
  cycle: number;
};

// Thin progress strip along the bottom of ?tv=1: fills over one rotation period so the
// viewer sees how long until the screen switches. Pure CSS animation — no timers to
// pause or clean up — and no text by the owner's request.
const TvRotationBar: React.FC<Props> = ({ durationMs, cycle }) => (
  <div aria-hidden="true" className="tv1-rotation-bar">
    <div
      key={cycle}
      data-cycle={cycle}
      className="tv1-rotation-bar__fill"
      style={{ animationDuration: `${durationMs}ms` }}
    />
  </div>
);

export default TvRotationBar;
