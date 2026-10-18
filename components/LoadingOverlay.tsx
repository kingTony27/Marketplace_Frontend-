"use client";

/**
 * LoadingOverlay
 * Full-screen blurred backdrop with an animated loader in the middle.
 *
 * HOW TO USE
 *   1. Put this file in components/LoadingOverlay.jsx
 *   2. Import it:   import LoadingOverlay from "@/components/LoadingOverlay";
 *   3. Render it:   <LoadingOverlay show={isLoading} />
 *
 * PROPS
 *   show  (boolean)  true = visible, false = hidden. Default: true
 *   src   (string)   optional image path, e.g. "/logo.png". If given, the
 *                    image is shown (pulsing) instead of the CSS spinner.
 *   size  (number)   loader size in px. Default: 64
 *
 * No Tailwind or extra packages needed.
 */

type LoadingOverlayProps = {
  show?: boolean;
  src?: string;
  size?: number;
};

export default function LoadingOverlay({ show = true, src, size = 64 }: LoadingOverlayProps) {
  if (!show) return null;

  return (
    <div
      className="lo-overlay"
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{ "--lo-size": `${size}px` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="lo-image" src={src} width={size} height={size} alt="" />
      ) : (
        <div className="lo-spinner" aria-hidden="true" />
      )}

      <style>{`
        .lo-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.3);
          -webkit-backdrop-filter: blur(6px);
          backdrop-filter: blur(6px);
          animation: lo-fade 0.15s ease-out;
        }

        /* Crafted spinner: two rings spinning in opposite directions */
        .lo-spinner {
          position: relative;
          width: var(--lo-size);
          height: var(--lo-size);
        }
        .lo-spinner::before,
        .lo-spinner::after {
          content: "";
          position: absolute;
          border-radius: 50%;
          border: 4px solid transparent;
        }
        .lo-spinner::before {
          inset: 0;
          border-top-color: #ffffff;
          border-right-color: #ffffff;
          animation: lo-spin 0.9s linear infinite;
        }
        .lo-spinner::after {
          inset: 22%;
          border-bottom-color: #4ade80;
          border-left-color: #4ade80;
          animation: lo-spin 0.7s linear infinite reverse;
        }

        /* Image loader: gentle pulse */
        .lo-image {
          object-fit: contain;
          animation: lo-pulse 1.2s ease-in-out infinite;
        }

        @keyframes lo-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes lo-pulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%      { transform: scale(0.88); opacity: 0.6; }
        }
        @keyframes lo-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* Respect "reduce motion" settings: pulse instead of spin */
        @media (prefers-reduced-motion: reduce) {
          .lo-spinner::before,
          .lo-spinner::after { animation: none; }
          .lo-spinner { animation: lo-pulse 1.6s ease-in-out infinite; }
        }
      `}</style>
    </div>
  );
}