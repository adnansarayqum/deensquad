// Runs once when the server starts. Copies any linked shop photos into the app in the background,
// so a fresh deploy (or the demo, which starts empty) doesn't depend on links that expire.
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  setTimeout(() => {
    import("./lib/shop/images").then((m) => m.localiseProductImages()).catch(() => {});
  }, 5_000);
}
