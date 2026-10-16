/** Indian food-type symbol: green dot for veg, brown triangle for non-veg. */
export function FoodMark({ isVeg, containsEgg, withLabel = false }: { isVeg: boolean; containsEgg?: boolean; withLabel?: boolean }) {
  const color = isVeg ? "#2e8b3a" : "#8a3b12";
  const label = isVeg ? "Veg" : containsEgg ? "Contains egg" : "Non-veg";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
      <span
        className="inline-grid h-4 w-4 place-items-center rounded-[3px] border-[1.5px] bg-white"
        style={{ borderColor: color }}
        role="img"
        aria-label={label}
      >
        {isVeg ? (
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        ) : (
          <span className="h-0 w-0 border-x-[4.5px] border-b-[8px] border-x-transparent" style={{ borderBottomColor: color }} />
        )}
      </span>
      {withLabel && label}
    </span>
  );
}
