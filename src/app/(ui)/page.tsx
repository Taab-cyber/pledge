import Link from "next/link";

const steps = [
  {
    num: "01",
    icon: "↗",
    title: "Drop in the chat",
    text: "Screenshots from WhatsApp, Instagram or email. AI turns the deal into milestones, to-dos and a fair split of the total.",
  },
  {
    num: "02",
    icon: "⌁",
    title: "Send one link",
    text: "Your client approves on their phone and secures the first milestone with PayPal. It's a hold — they're not charged yet.",
  },
  {
    num: "03",
    icon: "✓",
    title: "Deliver, get paid",
    text: "AI checks your delivery against the to-dos. The client approves and PayPal pays you directly, or it auto-releases after 72 hours.",
  },
];

const features = [
  { title: "One clear scope", desc: "Deliverables, revisions and dates in one place." },
  { title: "Milestone payments", desc: "Secure one stage at a time, not the whole project." },
  { title: "Scope guard", desc: "Spot extra requests before they become unpaid work." },
  { title: "Delivery checklist", desc: "Check submitted files against agreed to-dos." },
  { title: "Client-friendly review", desc: "Review the plan before creating an account." },
  { title: "Activity trail", desc: "Keep approvals and project updates together." },
];

export default function Home() {
  return (
    <div className="min-h-dvh" style={{ background: "#f4f8fc", color: "#172b4d" }}>
      {/* Nav */}
      <header
        style={{
          background: "#fff",
          borderBottom: "1px solid #e6edf3",
          boxShadow: "0 2px 8px rgba(25,66,105,.04)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            height: 72,
            padding: "0 32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#00a5ec",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              P
            </div>
            <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px", color: "#002970" }}>
              Pledge
            </span>
          </div>
          <nav style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link
              href="#how"
              style={{ fontSize: 13, fontWeight: 600, color: "#40546d", textDecoration: "none" }}
            >
              How it works
            </Link>
            <Link
              href="#features"
              style={{ fontSize: 13, fontWeight: 600, color: "#40546d", textDecoration: "none", marginRight: 8 }}
            >
              Features
            </Link>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#002970",
                border: "1px solid #cbd9e7",
                borderRadius: 7,
                padding: "10px 16px",
                textDecoration: "none",
                background: "#fff",
              }}
            >
              Log in
            </Link>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                background: "#00a5ec",
                borderRadius: 7,
                padding: "10px 16px",
                textDecoration: "none",
                boxShadow: "0 4px 12px rgba(0,165,236,.25)",
              }}
            >
              Open workspace ↗
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          background: "linear-gradient(115deg,#f0faff 0%,#e8f7ff 52%,#f8fcff 100%)",
          padding: "80px 32px 70px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "1.3px",
                textTransform: "uppercase",
                color: "#0088bd",
                marginBottom: 20,
              }}
            >
              <span style={{ width: 20, height: 2, background: "#00baf2", display: "inline-block" }} />
              THE WORKFLOW FOR INDEPENDENT WORK
            </div>
            <h1
              style={{
                fontSize: "clamp(40px,5vw,64px)",
                fontWeight: 700,
                lineHeight: 1.07,
                letterSpacing: "-2.8px",
                color: "#002970",
                margin: "0 0 20px",
              }}
            >
              Turn client chats into{" "}
              <em style={{ fontFamily: "Georgia,serif", fontStyle: "normal", color: "#008fc7" }}>
                clear agreements.
              </em>
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.78, color: "#536a83", maxWidth: 460, margin: "0 0 28px" }}>
              You already found the client. Pledge turns the conversation into a clear scope,
              milestone plan and payment process both sides can follow.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href="/login"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#00a5ec",
                  borderRadius: 7,
                  padding: "13px 20px",
                  textDecoration: "none",
                  boxShadow: "0 5px 14px rgba(0,165,236,.28)",
                }}
              >
                Create a project ↗
              </Link>
              <Link
                href="#how"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#002970",
                  background: "#fff",
                  border: "1px solid #cbd9e7",
                  borderRadius: 7,
                  padding: "13px 20px",
                  textDecoration: "none",
                }}
              >
                See how it works ↓
              </Link>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 28, fontSize: 11, color: "#78848d" }}>
              <div style={{ display: "flex" }}>
                {["R", "D", "M"].map((l, i) => (
                  <div
                    key={l}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: i === 0 ? "#f0d8cc" : "#d8e5dd",
                      color: i === 0 ? "#7a4530" : "#355548",
                      border: "2px solid #f0faff",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 8,
                      fontWeight: 700,
                      marginLeft: i === 0 ? 0 : -5,
                    }}
                  >
                    {l}
                  </div>
                ))}
              </div>
              <span>
                For independent creatives, makers &{" "}
                <strong style={{ color: "#172b4d" }}>small studios.</strong>
              </span>
            </div>
          </div>

          {/* Dashboard preview card */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                background: "#fff",
                border: "1px solid #d8e5ef",
                borderRadius: 14,
                boxShadow: "0 24px 65px rgba(0,41,112,.14)",
                width: "100%",
                maxWidth: 480,
                overflow: "hidden",
                transform: "rotate(-0.6deg)",
              }}
            >
              {/* Card top bar */}
              <div
                style={{
                  height: 46,
                  borderBottom: "1px solid #eaf0f5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 12, color: "#002970" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: "#00a5ec", display: "grid", placeItems: "center", color: "#fff", fontSize: 9, fontWeight: 800 }}>P</div>
                  Pledge <span style={{ fontWeight: 400, color: "#9aa39d", marginLeft: 2 }}>/ Workspace</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#ddd" }} />)}
                </div>
              </div>
              {/* Card body */}
              <div style={{ padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#002970" }}>Good morning, Riya.</div>
                    <div style={{ fontSize: 9, color: "#9aa3a0", marginTop: 2 }}>Here's where your projects stand.</div>
                  </div>
                  <span style={{ fontSize: 9, color: "#9aa3a0" }}>MON, NOV 09</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <div style={{ background: "#002970", color: "#fff", padding: 14, borderRadius: 8 }}>
                    <div style={{ fontSize: 9, color: "#b8c7bd" }}>Milestone authorised</div>
                    <div style={{ fontWeight: 700, fontSize: 22, margin: "7px 0 3px" }}>$1,250</div>
                    <div style={{ fontSize: 9, color: "#b8c7bd" }}>Via PayPal · Not captured</div>
                  </div>
                  <div style={{ background: "#f2faff", border: "1px solid #dceef8", padding: 14, borderRadius: 8 }}>
                    <div style={{ fontSize: 9, color: "#748078" }}>Released to you</div>
                    <div style={{ fontWeight: 700, fontSize: 22, margin: "7px 0 3px", color: "#002970" }}>$2,840</div>
                    <div style={{ fontSize: 9, color: "#0085b9" }}>↗ On track</div>
                  </div>
                </div>
                {/* Mini table */}
                <div style={{ border: "1px solid #e4edf4", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr .9fr .6fr", padding: "9px 11px", background: "#f7fafd", fontSize: 8, color: "#7d8fa3", fontWeight: 700, letterSpacing: ".6px" }}>
                    <span>PROJECT</span><span>CLIENT</span><span>STATUS</span>
                  </div>
                  {[
                    { title: "Brand identity", sub: "3 milestones", client: "Daniel B.", status: "In review", statusBg: "#e4f7ff", statusColor: "#006d9c" },
                    { title: "Editorial shoot", sub: "2 milestones", client: "Olive St.", status: "Secured", statusBg: "#e4f7ff", statusColor: "#006d9c" },
                    { title: "Website copy", sub: "Completed", client: "Northwind", status: "Paid", statusBg: "#f0f1ed", statusColor: "#66736a" },
                  ].map((row) => (
                    <div key={row.title} style={{ display: "grid", gridTemplateColumns: "1.4fr .9fr .6fr", padding: "10px 11px", borderTop: "1px solid #eff3f7", fontSize: 9, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 10 }}>{row.title}</div>
                        <div style={{ color: "#87938b", marginTop: 2 }}>{row.sub}</div>
                      </div>
                      <div>{row.client}</div>
                      <div style={{ background: row.statusBg, color: row.statusColor, padding: "3px 6px", borderRadius: 4, fontSize: 8, fontWeight: 700, display: "inline-block" }}>{row.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick action rail */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #eaf0f5",
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
        }}
      >
        {[
          { icon: "↗", bg: "#e8f5ff", color: "#0065b3", title: "Formalise a deal", sub: "Start with your chat" },
          { icon: "▤", bg: "#e3faff", color: "#008eb9", title: "Set milestones", sub: "Scope, dates & amounts" },
          { icon: "₹", bg: "#edf1fb", color: "#173c83", title: "Track payments", sub: "See each payment stage" },
          { icon: "✓", bg: "#eaf8ff", color: "#007cae", title: "Keep work in scope", sub: "Make changes explicit" },
        ].map((item) => (
          <Link
            key={item.title}
            href="/login"
            style={{
              display: "grid",
              gridTemplateColumns: "44px 1fr",
              gridTemplateRows: "auto auto",
              columnGap: 12,
              alignItems: "center",
              padding: "12px 20px",
              borderRight: "1px solid #e6eef5",
              textDecoration: "none",
            }}
          >
            <div
              style={{
                gridRow: "1/3",
                width: 42,
                height: 42,
                display: "grid",
                placeItems: "center",
                borderRadius: 12,
                background: item.bg,
                color: item.color,
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              {item.icon}
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#002970" }}>{item.title}</div>
            <div style={{ fontSize: 10, color: "#71849a", marginTop: 3 }}>{item.sub}</div>
          </Link>
        ))}
      </div>

      {/* Trust bar */}
      <div
        style={{
          background: "#fbfdff",
          borderBottom: "1px solid #edf2f6",
          padding: "18px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ fontSize: 11, color: "#637990", maxWidth: 200, lineHeight: 1.5 }}>
          Works with the tools you already use
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, color: "#385d59", fontSize: 13 }}>WhatsApp</span>
          <span style={{ fontFamily: "Georgia,serif", fontWeight: 500, color: "#61768e", fontSize: 15 }}>Instagram</span>
          <span style={{ fontWeight: 800, color: "#002970", fontSize: 13 }}>PayPal</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: "#71849a", letterSpacing: "0" }}>No marketplace. No bidding.</span>
        </div>
      </div>

      {/* How it works */}
      <section id="how" style={{ padding: "92px 32px", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginBottom: 40 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#188bc4", marginBottom: 10 }}>The simple part</div>
              <h2 style={{ fontSize: "clamp(30px,3.4vw,44px)", fontWeight: 700, letterSpacing: "-1.7px", color: "#002970", margin: 0, lineHeight: 1.12 }}>
                From a quick chat<br />to{" "}
                <span style={{ fontFamily: "Georgia,serif", fontWeight: 400 }}>a clear plan.</span>
              </h2>
            </div>
            <p style={{ maxWidth: 320, color: "#5c7087", lineHeight: 1.7, fontSize: 13, margin: 0 }}>
              No marketplace. No bidding. Just a better way to formalise the work and payment you've already discussed.
            </p>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              borderTop: "1px solid #dfeaf2",
              borderBottom: "1px solid #dfeaf2",
            }}
          >
            {steps.map((step, i) => (
              <div
                key={step.num}
                style={{
                  padding: "30px 24px 32px 0",
                  borderRight: i < 2 ? "1px solid #e1ebf2" : "none",
                  paddingLeft: i > 0 ? 24 : 0,
                }}
              >
                <div style={{ fontSize: 10, fontFamily: "monospace", color: "#7890a8" }}>{step.num} / STEP</div>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    background: "#eaf7ff",
                    color: "#007eaf",
                    borderRadius: 11,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 18,
                    margin: "22px 0 16px",
                  }}
                >
                  {step.icon}
                </div>
                <h3 style={{ fontWeight: 700, fontSize: 17, color: "#002970", margin: "0 0 9px" }}>{step.title}</h3>
                <p style={{ color: "#61758a", lineHeight: 1.7, fontSize: 12, maxWidth: 270, margin: 0 }}>{step.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ background: "#f2f9fd", padding: "82px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: ".8fr 1.2fr", gap: "8%", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#188bc4", marginBottom: 12 }}>MADE FOR HOW YOU WORK</div>
            <h2 style={{ fontSize: "clamp(30px,3.4vw,44px)", fontWeight: 700, letterSpacing: "-1.7px", color: "#002970", margin: "0 0 16px", lineHeight: 1.12 }}>
              A better experience<br />for both sides.
            </h2>
            <p style={{ fontSize: 13, lineHeight: 1.8, color: "#6d7971", maxWidth: 340, margin: "0 0 24px" }}>
              Freelancers need confidence that work will be paid for. Clients need to know exactly what they are agreeing to.
            </p>
            <Link
              href="/login"
              style={{
                display: "inline-block",
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                background: "#00a5ec",
                borderRadius: 7,
                padding: "13px 20px",
                textDecoration: "none",
                boxShadow: "0 5px 14px rgba(0,165,236,.25)",
              }}
            >
              Explore the workspace ↗
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
            {features.map((f) => (
              <div
                key={f.title}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "18px 0",
                  borderBottom: "1px solid #dce9f2",
                  alignItems: "flex-start",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#e1f6ff",
                    color: "#007da9",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    fontSize: 11,
                  }}
                >
                  ✓
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "#002970", marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 10, color: "#687d92", lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "0 32px 32px" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            borderRadius: 14,
            padding: "56px 48px",
            background: "linear-gradient(110deg,#e8f8ff,#dff4ff 55%,#eaf1ff)",
            border: "1px solid #d8edf8",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ fontWeight: 700, fontSize: "clamp(28px,3.2vw,42px)", letterSpacing: "-1.5px", color: "#002970", margin: "0 0 10px", lineHeight: 1.12 }}>
              Get paid for every<br />deal you close.
            </h2>
            <p style={{ fontSize: 13, color: "#526e88", margin: 0 }}>
              Pledge never holds money — PayPal moves it straight from client to freelancer.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#fff",
                background: "#00a5ec",
                borderRadius: 7,
                padding: "14px 22px",
                textDecoration: "none",
                boxShadow: "0 5px 14px rgba(0,165,236,.25)",
              }}
            >
              Try the demo ↗
            </Link>
            <Link
              href="/login"
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#002970",
                background: "#fff",
                border: "1px solid #cbd9e7",
                borderRadius: 7,
                padding: "14px 22px",
                textDecoration: "none",
              }}
            >
              Sign in with email
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: "#fff",
          borderTop: "1px solid #edf2f6",
          padding: "24px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          color: "#71859a",
          fontSize: 11,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 15, color: "#002970" }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: "#00a5ec", display: "grid", placeItems: "center", color: "#fff", fontSize: 11, fontWeight: 800 }}>P</div>
          Pledge
        </div>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="#how" style={{ color: "#71859a", textDecoration: "none" }}>How it works</Link>
          <Link href="#features" style={{ color: "#71859a", textDecoration: "none" }}>Features</Link>
          <Link href="/login" style={{ color: "#71859a", textDecoration: "none" }}>Sign in</Link>
        </div>
        <span>Hackathon prototype · PayPal sandbox · no real money</span>
      </footer>
    </div>
  );
}
