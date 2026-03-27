import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { fade } from "@remotion/transitions/fade";

// Actual app colors
const COLORS = {
  primary: "#2563eb",
  primaryLight: "#3b82f6",
  background: "#f8fafc",
  card: "rgba(255, 255, 255, 0.7)",
  dark: "#0f172a",
  muted: "#64748b",
  border: "rgba(226, 232, 240, 0.5)",
  success: "#10b981",
  warning: "#f59e0b",
  violet: "#8b5cf6",
  cyan: "#06b6d4",
};

// Navbar Component (actual app design)
const Navbar = () => (
  <div
    style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 64,
      background: "rgba(255, 255, 255, 0.8)",
      backdropFilter: "blur(20px)",
      borderBottom: "1px solid rgba(226, 232, 240, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 48px",
      zIndex: 100,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryLight} 100%)`,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
        <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.dark }}>Invio</span>
      </div>
      <nav style={{ display: "flex", gap: 32, marginLeft: 32 }}>
        {["Dashboard", "Invoices", "Customers", "Inventory", "Reports"].map((item, i) => (
          <span
            key={item}
            style={{
              fontSize: 14,
              fontWeight: i === 0 ? 600 : 500,
              color: i === 0 ? COLORS.primary : COLORS.muted,
              borderBottom: i === 0 ? `2px solid ${COLORS.primary}` : "none",
              paddingBottom: 4,
            }}
          >
            {item}
          </span>
        ))}
      </nav>
    </div>
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "#e2e8f0",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        fontWeight: 600,
        color: COLORS.dark,
      }}
    >
      P
    </div>
  </div>
);

// Frosted Glass Card
const GlassCard = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) => (
  <div
    style={{
      background: COLORS.card,
      backdropFilter: "blur(20px)",
      borderRadius: 20,
      border: `1px solid ${COLORS.border}`,
      boxShadow: "0 4px 24px rgba(0, 0, 0, 0.06)",
      ...style,
    }}
  >
    {children}
  </div>
);

// Scene 1: Intro with Logo
const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12 } });
  const logoRotate = interpolate(spring({ frame, fps, config: { damping: 20 } }), [0, 1], [-10, 0]);

  const taglineOpacity = interpolate(frame, [fps * 0.6, fps * 1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineY = interpolate(frame, [fps * 0.6, fps * 1], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Floating particles
  const particles = [...Array(15)].map((_, i) => {
    const x = (i * 127) % 100;
    const y = (i * 83) % 100;
    const size = 6 + (i % 3) * 4;
    const delay = i * 0.08;
    const particleProgress = spring({ frame: frame - fps * delay, fps, config: { damping: 15 } });
    return (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: size,
          height: size,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${COLORS.primary}40 0%, ${COLORS.violet}40 100%)`,
          opacity: particleProgress * 0.5,
          transform: `scale(${particleProgress})`,
        }}
      />
    );
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${COLORS.dark} 0%, #1e293b 50%, #0f172a 100%)`,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {particles}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          transform: `scale(${logoScale}) rotate(${logoRotate}deg)`,
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryLight} 50%, ${COLORS.violet} 100%)`,
            borderRadius: 36,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            boxShadow: `0 30px 80px ${COLORS.primary}60`,
            marginBottom: 32,
          }}
        >
          <svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "white",
            margin: 0,
            letterSpacing: -3,
          }}
        >
          Invio
        </h1>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 180,
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 32, color: "rgba(255,255,255,0.9)", margin: 0, fontWeight: 500 }}>
          Voice-Powered Invoicing
        </p>
        <p style={{ fontSize: 22, color: "rgba(255,255,255,0.6)", margin: "12px 0 0", fontWeight: 400 }}>
          for Indian Small Businesses
        </p>
      </div>
    </AbsoluteFill>
  );
};

// Scene 2: Dashboard Overview
const DashboardScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { title: "Total Invoices", value: "127", icon: "file", color: COLORS.primary },
    { title: "Customers", value: "34", icon: "users", color: COLORS.violet },
    { title: "Revenue", value: "₹4,82,500", icon: "rupee", color: COLORS.success },
    { title: "Pending", value: "₹45,200", icon: "clock", color: COLORS.warning },
  ];

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <Navbar />

      <div style={{ padding: "100px 48px 48px" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: COLORS.dark,
              margin: 0,
              opacity: spring({ frame, fps, config: { damping: 15 } }),
            }}
          >
            Good afternoon!
          </h1>
          <p
            style={{
              fontSize: 18,
              color: COLORS.muted,
              margin: "8px 0 0",
              opacity: spring({ frame: frame - 5, fps, config: { damping: 15 } }),
            }}
          >
            Here's what's happening with your business today.
          </p>
        </div>

        {/* Stats Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {stats.map((stat, i) => {
            const delay = i * 0.1;
            const cardProgress = spring({ frame: frame - fps * delay, fps, config: { damping: 12 } });
            const scale = interpolate(cardProgress, [0, 1], [0.8, 1]);
            const opacity = cardProgress;

            return (
              <GlassCard
                key={stat.title}
                style={{
                  padding: 24,
                  transform: `scale(${scale})`,
                  opacity,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <p style={{ fontSize: 14, color: COLORS.muted, margin: 0, fontWeight: 500 }}>
                      {stat.title}
                    </p>
                    <p style={{ fontSize: 32, fontWeight: 700, color: COLORS.dark, margin: "8px 0 0" }}>
                      {stat.value}
                    </p>
                  </div>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: `${stat.color}15`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div style={{ width: 24, height: 24, background: stat.color, borderRadius: 6 }} />
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>

        {/* AI Insights Banner */}
        <div
          style={{
            marginTop: 32,
            opacity: spring({ frame: frame - fps * 0.6, fps, config: { damping: 15 } }),
            transform: `translateY(${interpolate(
              spring({ frame: frame - fps * 0.6, fps, config: { damping: 15 } }),
              [0, 1],
              [20, 0]
            )}px)`,
          }}
        >
          <GlassCard
            style={{
              padding: 24,
              background: `linear-gradient(135deg, ${COLORS.violet}10 0%, ${COLORS.primary}10 100%)`,
              border: `1px solid ${COLORS.violet}30`,
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: `linear-gradient(135deg, ${COLORS.violet} 0%, ${COLORS.primary} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
              </svg>
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: COLORS.dark, margin: 0 }}>
                AI Insights Available
              </p>
              <p style={{ fontSize: 14, color: COLORS.muted, margin: "4px 0 0" }}>
                Get personalized business recommendations powered by AI
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 3: Voice Recording
const VoiceRecordingScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isRecording = frame > fps * 0.5;
  const pulseScale = isRecording ? 1 + Math.sin(frame * 0.15) * 0.08 : 1;

  // Waveform animation
  const waveforms = [...Array(24)].map((_, i) => {
    const height = isRecording
      ? 20 + Math.sin((frame * 0.2 + i * 0.4)) * 25 + Math.random() * 10
      : 8;
    return height;
  });

  // Transcript typing
  const fullText = '"3×6 SS sheet 400 ton, 2,40,000. Fiber sheet 2×6, 100 ton, 90,000. 18% GST. Rewanat Industries ke naam pe."';
  const typingProgress = interpolate(frame, [fps * 1.5, fps * 4.5], [0, fullText.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const displayText = fullText.slice(0, Math.floor(typingProgress));

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <Navbar />

      <div style={{ padding: "100px 48px 48px" }}>
        {/* Page Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.muted} strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: COLORS.dark, margin: 0 }}>
            New Invoice
          </h1>
        </div>

        {/* Voice Recording Card */}
        <GlassCard style={{ padding: 32, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* Mic Button */}
            <div style={{ position: "relative" }}>
              {isRecording && (
                <>
                  <div
                    style={{
                      position: "absolute",
                      inset: -16,
                      borderRadius: "50%",
                      background: `${COLORS.primary}15`,
                      transform: `scale(${pulseScale * 1.2})`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: -8,
                      borderRadius: "50%",
                      background: `${COLORS.primary}25`,
                      transform: `scale(${pulseScale})`,
                    }}
                  />
                </>
              )}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: isRecording
                    ? `linear-gradient(135deg, #ef4444 0%, #dc2626 100%)`
                    : `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryLight} 100%)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isRecording
                    ? "0 8px 32px rgba(239, 68, 68, 0.4)"
                    : `0 8px 32px ${COLORS.primary}40`,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </div>
            </div>

            {/* Waveform */}
            <div style={{ display: "flex", alignItems: "center", gap: 3, height: 60 }}>
              {waveforms.map((height, i) => (
                <div
                  key={i}
                  style={{
                    width: 4,
                    height: Math.max(8, height),
                    borderRadius: 2,
                    background: isRecording ? COLORS.primary : "#e2e8f0",
                    opacity: isRecording ? 0.6 + Math.sin(i * 0.5) * 0.4 : 0.5,
                    transition: "height 0.1s ease",
                  }}
                />
              ))}
            </div>

            <div style={{ marginLeft: "auto" }}>
              {isRecording && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    background: "#fef2f2",
                    borderRadius: 20,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#ef4444",
                      opacity: Math.sin(frame * 0.2) > 0 ? 1 : 0.3,
                    }}
                  />
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#dc2626" }}>Recording...</span>
                </div>
              )}
            </div>
          </div>

          {/* Transcript */}
          {displayText && (
            <div
              style={{
                marginTop: 24,
                padding: 20,
                background: "#f8fafc",
                borderRadius: 16,
                border: "1px solid #e2e8f0",
              }}
            >
              <p style={{ fontSize: 12, color: COLORS.muted, margin: "0 0 8px", fontWeight: 500 }}>
                Transcript:
              </p>
              <p style={{ fontSize: 18, color: COLORS.dark, margin: 0, fontStyle: "italic", lineHeight: 1.6 }}>
                {displayText}
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 20,
                    background: COLORS.primary,
                    marginLeft: 2,
                    verticalAlign: "middle",
                    opacity: Math.sin(frame * 0.25) > 0 ? 1 : 0,
                  }}
                />
              </p>
            </div>
          )}
        </GlassCard>

        {/* AI Processing indicator */}
        {frame > fps * 4.5 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 24px",
              background: `linear-gradient(135deg, ${COLORS.primary}10 0%, ${COLORS.violet}10 100%)`,
              borderRadius: 16,
              border: `1px solid ${COLORS.primary}20`,
              opacity: spring({ frame: frame - fps * 4.5, fps, config: { damping: 15 } }),
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={COLORS.primary}
              style={{
                animation: "none",
                transform: `rotate(${frame * 3}deg)`,
              }}
            >
              <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.primary }}>
              AI extracting invoice details...
            </span>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

// Scene 4: Generated Invoice
const GeneratedInvoiceScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const items = [
    { name: "3×6 SS Sheet", qty: 400, unit: "ton", rate: 600, amount: 240000 },
    { name: "2×6 Fiber Sheet", qty: 100, unit: "ton", rate: 900, amount: 90000 },
  ];
  const subtotal = 330000;
  const gst = 59400;
  const total = 389400;

  return (
    <AbsoluteFill style={{ background: COLORS.background }}>
      <Navbar />

      <div style={{ padding: "100px 48px 48px", display: "flex", gap: 32 }}>
        {/* Invoice Form */}
        <div style={{ flex: 1 }}>
          {/* Success Banner */}
          <div
            style={{
              marginBottom: 24,
              padding: "16px 20px",
              background: `linear-gradient(135deg, ${COLORS.success}15 0%, ${COLORS.cyan}15 100%)`,
              borderRadius: 16,
              border: `1px solid ${COLORS.success}30`,
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: spring({ frame, fps, config: { damping: 15 } }),
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill={COLORS.success}>
              <path d="M12 2l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            </svg>
            <span style={{ fontSize: 14, color: COLORS.success, fontWeight: 500 }}>
              AI extracted the values below. Please verify and edit if needed.
            </span>
          </div>

          <GlassCard style={{ padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: COLORS.dark, margin: "0 0 24px" }}>
              Invoice Details
            </h2>

            {/* Customer */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 14, color: COLORS.muted, fontWeight: 500 }}>Customer</label>
              <div
                style={{
                  marginTop: 8,
                  padding: "14px 16px",
                  background: "white",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 16,
                  color: COLORS.dark,
                  fontWeight: 500,
                  opacity: spring({ frame: frame - 5, fps, config: { damping: 15 } }),
                }}
              >
                Rewanat Industries
              </div>
            </div>

            {/* Items */}
            <h3 style={{ fontSize: 16, fontWeight: 600, color: COLORS.dark, margin: "0 0 16px" }}>Items</h3>
            {items.map((item, i) => {
              const itemOpacity = spring({ frame: frame - fps * 0.2 * (i + 1), fps, config: { damping: 12 } });
              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 16,
                    padding: 20,
                    background: "white",
                    borderRadius: 16,
                    border: "1px solid #e2e8f0",
                    opacity: itemOpacity,
                    transform: `translateX(${interpolate(itemOpacity, [0, 1], [-20, 0])}px)`,
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.dark, marginBottom: 12 }}>
                    {item.name}
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Qty</div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{item.qty}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Unit</div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{item.unit}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Rate</div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>₹{item.rate}</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>Amount</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.primary }}>
                        ₹{item.amount.toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </GlassCard>
        </div>

        {/* Summary Card */}
        <div style={{ width: 320 }}>
          <GlassCard
            style={{
              padding: 28,
              position: "sticky",
              top: 100,
              opacity: spring({ frame: frame - fps * 0.4, fps, config: { damping: 12 } }),
              transform: `translateY(${interpolate(
                spring({ frame: frame - fps * 0.4, fps, config: { damping: 12 } }),
                [0, 1],
                [30, 0]
              )}px)`,
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 600, color: COLORS.dark, margin: "0 0 24px" }}>
              Summary
            </h3>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: COLORS.muted }}>Subtotal</span>
              <span style={{ fontWeight: 500 }}>₹{subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: COLORS.muted }}>CGST (9%)</span>
              <span style={{ fontWeight: 500 }}>₹{(gst / 2).toLocaleString("en-IN")}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <span style={{ color: COLORS.muted }}>SGST (9%)</span>
              <span style={{ fontWeight: 500 }}>₹{(gst / 2).toLocaleString("en-IN")}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 20,
                borderTop: "2px solid #e2e8f0",
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.dark }}>Total</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: COLORS.primary }}>
                ₹{total.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Create Button */}
            <button
              style={{
                marginTop: 24,
                width: "100%",
                padding: "16px 24px",
                background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.primaryLight} 100%)`,
                border: "none",
                borderRadius: 14,
                color: "white",
                fontSize: 16,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: `0 8px 24px ${COLORS.primary}40`,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Create Invoice
            </button>
          </GlassCard>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Scene 5: CTA
const CTAScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12 } });
  const buttonPulse = 1 + Math.sin(frame * 0.08) * 0.02;

  const features = [
    "Voice in Hindi, Marathi, English",
    "GST-Ready Invoices",
    "AI That Learns",
    "WhatsApp Sharing",
  ];

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${COLORS.primary} 0%, #1d4ed8 50%, ${COLORS.violet} 100%)`,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* Background pattern */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div style={{ textAlign: "center", transform: `scale(${Math.min(scale, 1)})`, zIndex: 1 }}>
        {/* Logo */}
        <div
          style={{
            width: 80,
            height: 80,
            background: "rgba(255,255,255,0.15)",
            borderRadius: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 32px",
            backdropFilter: "blur(10px)",
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          Start Invoicing
          <br />
          <span style={{ opacity: 0.9 }}>with Your Voice</span>
        </h1>

        {/* Features */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 32,
            marginTop: 40,
            flexWrap: "wrap",
          }}
        >
          {features.map((feature, i) => {
            const featureOpacity = spring({ frame: frame - fps * 0.15 * i, fps, config: { damping: 15 } });
            return (
              <div
                key={feature}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: featureOpacity,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontSize: 18, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>
                  {feature}
                </span>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <div
          style={{
            marginTop: 48,
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "20px 48px",
            background: "white",
            borderRadius: 20,
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            transform: `scale(${buttonPulse})`,
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 700, color: COLORS.primary }}>
            Try Free — 50 Invoices
          </span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={COLORS.primary} strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>

        <p style={{ marginTop: 20, fontSize: 16, color: "rgba(255,255,255,0.6)" }}>
          No credit card required
        </p>
      </div>
    </AbsoluteFill>
  );
};

// Main Demo Composition
export const InvioDemo = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: COLORS.dark, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <TransitionSeries>
        {/* Intro - 3 seconds */}
        <TransitionSeries.Sequence durationInFrames={fps * 3}>
          <IntroScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: Math.floor(fps * 0.4) })}
        />

        {/* Dashboard - 4 seconds */}
        <TransitionSeries.Sequence durationInFrames={fps * 4}>
          <DashboardScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: Math.floor(fps * 0.4) })}
        />

        {/* Voice Recording - 6 seconds */}
        <TransitionSeries.Sequence durationInFrames={fps * 6}>
          <VoiceRecordingScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: Math.floor(fps * 0.4) })}
        />

        {/* Generated Invoice - 5 seconds */}
        <TransitionSeries.Sequence durationInFrames={fps * 5}>
          <GeneratedInvoiceScene />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: Math.floor(fps * 0.5) })}
        />

        {/* CTA - 4 seconds */}
        <TransitionSeries.Sequence durationInFrames={fps * 4}>
          <CTAScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
