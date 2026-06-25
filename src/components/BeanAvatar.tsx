import beanAnxious from "../assets/beans/bean_anxious.png";
import beanDisciplined from "../assets/beans/bean_disciplined.png";
import beanGrowth from "../assets/beans/bean_growth.png";
import beanHappy from "../assets/beans/bean_happy.png";
import beanInsomnia from "../assets/beans/bean_insomnia.png";
import beanPalpitation from "../assets/beans/bean_palpitation.png";
import beanSleep from "../assets/beans/bean_sleep.png";
import beanStable from "../assets/beans/bean_stable.png";
import { cn } from "../lib/utils";

export type BeanAvatarStatus =
  | "happy"
  | "stable"
  | "sleep_safe"
  | "disciplined"
  | "growth"
  | "anxious"
  | "insomnia"
  | "palpitation";

type BeanAvatarProps = {
  status: BeanAvatarStatus;
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  label?: string;
};

const sizeMap = {
  sm: "h-16 w-16 p-1.5",
  md: "h-[88px] w-[88px] p-2",
  lg: "h-28 w-28 p-2.5",
};

const beanImageMap: Record<BeanAvatarStatus, string> = {
  happy: beanHappy,
  stable: beanStable,
  sleep_safe: beanSleep,
  disciplined: beanDisciplined,
  growth: beanGrowth,
  anxious: beanAnxious,
  insomnia: beanInsomnia,
  palpitation: beanPalpitation,
};

export function BeanAvatar({ status, size = "md", animated = false, label }: BeanAvatarProps) {
  const safeStatus = beanImageMap[status] ? status : "stable";

  return (
    <div
      className={cn(
        "bean-avatar shrink-0 overflow-visible rounded-full bg-white shadow-soft",
        sizeMap[size],
        animated && `bean-${safeStatus}`,
      )}
      aria-label={label ?? safeStatus}
      role="img"
    >
      <img
        src={beanImageMap[safeStatus]}
        alt={label ?? safeStatus}
        className={cn("bean-avatar-image h-full w-full object-contain", animated && "bean-animated")}
        draggable={false}
      />
    </div>
  );
}
