import Link from "next/link";

const steps = [
  [
    "Drop in the chat",
    "Screenshots from WhatsApp, Instagram or email. AI turns the deal into milestones, to-dos and a fair split of the total.",
  ],
  [
    "Send one link",
    "Your client approves on their phone and secures the first milestone with PayPal. It's a hold: they're not charged yet.",
  ],
  [
    "Deliver, get paid",
    "AI checks your delivery against the to-dos. The client approves and PayPal pays you directly, or it auto-releases after 72 hours.",
  ],
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-10 p-6 md:p-10">
      <header className="flex items-center justify-between">
        <span className="text-2xl font-bold text-accent">Pledge</span>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold underline"
        >
          Sign in
        </Link>
      </header>

      <section className="flex flex-col gap-4">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">
          Get paid for every deal you close in a chat.
        </h1>
        <p className="max-w-2xl text-lg text-ink-soft">
          Freelancers agree work on WhatsApp and Instagram, deliver, and then the client goes quiet.
          Pledge turns that chat into a plan your client secures with a PayPal hold, before you
          start.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm font-semibold text-white"
          >
            Try the demo
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-xl border border-line bg-white px-5 text-sm font-semibold"
          >
            Sign in with email
          </Link>
        </div>
      </section>

      <ol className="grid gap-4 md:grid-cols-3">
        {steps.map(([title, text], i) => (
          <li
            key={title}
            className="flex flex-col gap-2 rounded-[18px] border border-line bg-white p-5"
          >
            <span className="text-sm font-semibold text-accent">Step {i + 1}</span>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-ink-soft">{text}</p>
          </li>
        ))}
      </ol>

      <p className="text-xs text-ink-soft">
        Pledge never holds money: PayPal moves it straight from the client to the freelancer.
        Hackathon prototype running on the PayPal sandbox.
      </p>
    </main>
  );
}
