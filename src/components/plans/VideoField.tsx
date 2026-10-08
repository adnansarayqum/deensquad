/** The plan and practice-sheet forms' optional YouTube link (checked by `readVideoField` on save). */
export function VideoField({ defaultValue = "" }: { defaultValue?: string }) {
  return (
    <div>
      <label htmlFor="video" className="field-label">
        YouTube video link <span className="font-normal text-ink-muted">(optional)</span>
      </label>
      <input
        id="video"
        name="video"
        type="url"
        inputMode="url"
        autoComplete="off"
        maxLength={300}
        defaultValue={defaultValue}
        placeholder="https://youtu.be/…"
        aria-describedby="video-hint"
        className="field"
      />
      <p id="video-hint" className="mt-1.5 text-sm text-ink-muted">
        From YouTube&apos;s Share button. Parents tap to play it in the app. Leave it empty for no video.
      </p>
    </div>
  );
}
