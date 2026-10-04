import { Shirt } from "lucide-react";

/** Product photo, or the mowing stripes with a shirt when the club hasn't added one yet. */
export function ProductImage({ src, name, large = false }: { src: string | null; name: string; large?: boolean }) {
  const size = large ? "aspect-[4/3]" : "aspect-square";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- photos are on the club's own host
    return <img src={src} alt={name} className={`${size} w-full bg-cream object-cover`} loading="lazy" />;
  }
  return (
    <span aria-hidden className={`stripes-v-tight ${size} grid w-full place-items-center`}>
      <Shirt size={large ? 72 : 44} className="text-on-pitch opacity-80" />
    </span>
  );
}
