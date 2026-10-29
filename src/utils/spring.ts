/** Exact critically damped step: stable across refresh rates and rapid retargets. */
export function stepCriticalSpring(position: number, velocity: number, target: number, seconds: number, response: number) {
  const frequency = 5 / response
  const displacement = position - target
  const impulse = velocity + frequency * displacement
  const decay = Math.exp(-frequency * seconds)
  return {
    position: target + (displacement + impulse * seconds) * decay,
    velocity: (velocity - frequency * impulse * seconds) * decay,
  }
}
