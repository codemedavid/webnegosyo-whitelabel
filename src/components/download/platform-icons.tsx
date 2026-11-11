interface IconProps {
  className?: string;
}

export function AppleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.83.93-2.2 1.65-3.32 1.56-.13-1.1.45-2.27 1.1-3 .73-.82 2.04-1.45 3.1-1.54.02.13.03.27.03.4zM20.94 17.1c-.5 1.15-.74 1.66-1.39 2.68-.9 1.42-2.18 3.18-3.76 3.2-1.4.01-1.76-.92-3.66-.91-1.9.01-2.3.93-3.7.92-1.58-.02-2.79-1.61-3.69-3.02-2.52-3.96-2.79-8.6-1.23-11.07 1.1-1.75 2.85-2.78 4.49-2.78 1.67 0 2.72.92 4.1.92 1.34 0 2.16-.92 4.09-.92 1.46 0 3.01.8 4.11 2.17-3.61 1.98-3.02 7.14.34 8.81z" />
    </svg>
  );
}

/**
 * The Android robot, not the Google Play mark: the Android build is a
 * sideloaded APK, not a Play Store listing.
 */
export function AndroidIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396" />
    </svg>
  );
}

export function WindowsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M0 3.45 9.75 2.1v9.45H0V3.45zM10.95 1.95 24 0v11.4H10.95V1.95zM0 12.6h9.75v9.45L0 20.55V12.6zM10.95 12.6H24V24l-13.05-1.8V12.6z" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z" />
    </svg>
  );
}

export function BriefcaseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v4H2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2zm0 3h6V5H9v1zM2 13.5h8V15a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1.5h8V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5.5z" />
    </svg>
  );
}
