export interface AnimationOptions {
	animation: 'cipher' | 'glitch' | 'none';
	duration?: string | number; // Can be "1s" or 1000 (ms)
	delay?: string | number;
	reverse?: boolean; // For cipher: if true, animates from clear to scrambled. If false (default), animates from scrambled to clear
	property?: string; // Property to animate (default: 'textContent'). Use 'value' for input elements, etc.
	newText?: string; // For cipher animation only: when reverse=false, morphs from current text to this new text
	reachNewTextBeforeCipherUnscramble?: boolean; // For newText transitions: if true, fully animates length to newText.length before revealing characters
	onAnimationStart?: () => void;
	onAnimationComplete?: (el: HTMLElement) => void;
	onAnimationStartDetailed?: (details: { animation: string }) => void;
	onAnimationCompleteDetailed?: (details: { animation: string }) => void;
}

export interface AnimationController {
	promise: Promise<void>;
	isAnimating: () => boolean;
	stop: () => void;
	restart: () => void;
}

// Characters to use for cipher animation randomization
const randomChars =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';

function GetRandomCharacter(): string {
	return randomChars[Math.floor(Math.random() * randomChars.length)];
}

function ParseDuration(duration: string | number): number {
	if (typeof duration === 'number') {
		return duration;
	}
	// Parse CSS time values like "1s", "500ms"
	const match = duration.match(/^(\d+(?:\.\d+)?)(s|ms)?$/);
	if (!match) {
		return 1000; // Default 1 second
	}

	const value = parseFloat(match[1]);
	const unit = match[2] || 'ms';

	return unit === 's' ? value * 1000 : value;
}

// Helper functions to get and set element property values
function GetElementProperty(element: HTMLElement, property: string): string {
	if (property === 'textContent') {
		return element.textContent || '';
	} else if (property === 'innerText') {
		return element.innerText || '';
	} else if (property === 'innerHTML') {
		return element.innerHTML || '';
	} else {
		// For other properties like 'value', 'title', etc.
		return ((element as unknown as Record<string, unknown>)[property] as string) || '';
	}
}

function SetElementProperty(element: HTMLElement, property: string, value: string): void {
	if (property === 'textContent') {
		element.textContent = value;
	} else if (property === 'innerText') {
		element.innerText = value;
	} else if (property === 'innerHTML') {
		element.innerHTML = value;
	} else {
		// For other properties like 'value', 'title', etc.
		(element as unknown as Record<string, unknown>)[property] = value;
	}
}

function ApplyCipherAnimation(
	element: HTMLElement,
	originalText: string,
	options: AnimationOptions,
): AnimationController {
	let isAnimating = false;
	let animationStopped = false;
	let resolveAnimation: (() => void) | null = null;

	const durationMs = ParseDuration(options.duration || 1000);
	const delayMs = ParseDuration(options.delay || 0);
	const isReverse = options.reverse || false;
	const targetProperty = options.property || 'textContent';

	const promise = new Promise<void>((resolve) => {
		resolveAnimation = resolve;

		if (isAnimating || !originalText) {
			resolve();
			return;
		}

		isAnimating = true;
		const revealedChars = new Array(originalText.length).fill(false);

		// Call callback props
		options.onAnimationStartDetailed?.({ animation: options.animation });
		options.onAnimationStart?.();

		const frameRate = 60; // 60fps
		const frameInterval = 1000 / frameRate;

		const delayStartTime = Date.now();
		let delayElapsed = 0;

		// During delay: show original text for reverse mode, scrambled for normal mode
		const showDuringDelay = delayMs > 0;

		const delayFrame = () => {
			if (animationStopped) {
				resolve();
				return;
			}
			delayElapsed = Date.now() - delayStartTime;

			if (isReverse) {
				// For reverse mode, show clear text during delay
				SetElementProperty(element, targetProperty, originalText);
			} else {
				// For normal mode, show scrambled text during delay
				// Use original text length as the base for scrambling, even if morphing to new text
				let scrambledText = '';
				for (let i = 0; i < originalText.length; i++) {
					const char = originalText[i];
					if (char === '\n') {
						scrambledText += '\n';
					} else if (char === ' ') {
						scrambledText += ' ';
					} else {
						scrambledText += GetRandomCharacter();
					}
				}
				SetElementProperty(element, targetProperty, scrambledText);
			}

			if (delayElapsed < delayMs) {
				setTimeout(delayFrame, frameInterval);
			} else {
				// Start the main animation after delay
				startMainAnimation();
			}
		};

		const startMainAnimation = () => {
			if (animationStopped) {
				resolve();
				return;
			}

			const startTime = Date.now();

			const animate = () => {
				if (animationStopped) {
					resolve();
					return;
				}

				const elapsed = Date.now() - startTime;
				const progress = Math.min(elapsed / durationMs, 1);

				if (isReverse) {
					// Reverse mode: gradually scramble from clear to scrambled
					const charsToScramble = Math.floor(progress * originalText.length);

					// Mark characters as scrambled in order
					for (let i = 0; i < charsToScramble; i++) {
						revealedChars[i] = true; // We reuse this array but now it means "scrambled"
					}

					// Build display text
					let newDisplayText = '';
					for (let i = 0; i < originalText.length; i++) {
						const char = originalText[i];
						if (char === '\n') {
							newDisplayText += '\n'; // Always preserve newlines
						} else if (revealedChars[i]) {
							// This character should be scrambled
							if (char === ' ') {
								newDisplayText += ' '; // Keep spaces as spaces
							} else {
								newDisplayText += GetRandomCharacter();
							}
						} else {
							// This character should remain clear
							newDisplayText += char;
						}
					}

					SetElementProperty(element, targetProperty, newDisplayText);

					if (progress < 1) {
						setTimeout(animate, frameInterval);
					} else {
						// Animation complete - show fully scrambled text
						let finalScrambledText = '';
						for (let i = 0; i < originalText.length; i++) {
							const char = originalText[i];
							if (char === '\n') {
								finalScrambledText += '\n';
							} else if (char === ' ') {
								finalScrambledText += ' ';
							} else {
								finalScrambledText += GetRandomCharacter();
							}
						}
						SetElementProperty(element, targetProperty, finalScrambledText);
						isAnimating = false;

						// Call callback props
						options.onAnimationCompleteDetailed?.({ animation: options.animation });
						options.onAnimationComplete?.(element);

						resolve();
					}
				} else {
					// Normal mode: gradually reveal from scrambled to clear

					// Check if we're morphing to new text (only when reverse=false)
					const targetText = options.newText || originalText;
					const useTextMorphing = options.newText && !isReverse;

					if (useTextMorphing) {
						// Text morphing mode: transition from originalText to newText
						const startLength = originalText.length;
						const endLength = targetText.length;
						const useTwoPhaseAnimation = options.reachNewTextBeforeCipherUnscramble;

						if (useTwoPhaseAnimation) {
							// Two-phase animation: length first, then reveal
							const lengthPhaseEnd = 0.5; // First 50% for length animation

							if (progress <= lengthPhaseEnd) {
								// Phase 1: Animate length while keeping everything scrambled
								const lengthProgress = progress / lengthPhaseEnd;
								const currentTargetLength = Math.round(
									startLength + (endLength - startLength) * lengthProgress,
								);

								// Build fully scrambled text at current length
								let newDisplayText = '';
								for (let i = 0; i < currentTargetLength; i++) {
									const targetChar = i < targetText.length ? targetText[i] : '';

									if (targetChar === '\n') {
										newDisplayText += '\n'; // Always preserve newlines
									} else if (targetChar === ' ') {
										newDisplayText += ' '; // Keep spaces as spaces
									} else {
										newDisplayText += GetRandomCharacter();
									}
								}

								SetElementProperty(element, targetProperty, newDisplayText);
							} else {
								// Phase 2: Reveal characters (length is now at target)
								const revealProgress =
									(progress - lengthPhaseEnd) / (1 - lengthPhaseEnd);
								const charsToReveal = Math.floor(revealProgress * endLength);

								// Reset revealed chars for current iteration
								revealedChars.fill(false);
								for (let i = 0; i < charsToReveal; i++) {
									revealedChars[i] = true;
								}

								// Build display text with reveal
								let newDisplayText = '';
								for (let i = 0; i < endLength; i++) {
									const targetChar = i < targetText.length ? targetText[i] : '';

									if (targetChar === '\n') {
										newDisplayText += '\n'; // Always preserve newlines
									} else if (revealedChars[i]) {
										newDisplayText += targetChar;
									} else if (targetChar === ' ') {
										newDisplayText += ' '; // Keep spaces as spaces
									} else {
										newDisplayText += GetRandomCharacter();
									}
								}

								SetElementProperty(element, targetProperty, newDisplayText);
							}
						} else {
							// Original single-phase morphing animation
							const currentTargetLength = Math.round(
								startLength + (endLength - startLength) * progress,
							);
							const charsToReveal = Math.floor(progress * currentTargetLength);

							// Reset revealed chars for current iteration
							revealedChars.fill(false);
							for (let i = 0; i < charsToReveal; i++) {
								revealedChars[i] = true;
							}

							// Build display text with morphing
							let newDisplayText = '';
							for (let i = 0; i < currentTargetLength; i++) {
								const targetChar = i < targetText.length ? targetText[i] : '';

								if (targetChar === '\n') {
									newDisplayText += '\n'; // Always preserve newlines
								} else if (revealedChars[i]) {
									newDisplayText += targetChar;
								} else if (targetChar === ' ') {
									newDisplayText += ' '; // Keep spaces as spaces
								} else {
									newDisplayText += GetRandomCharacter();
								}
							}

							SetElementProperty(element, targetProperty, newDisplayText);
						}

						if (progress < 1) {
							setTimeout(animate, frameInterval);
						} else {
							// Animation complete - show final target text
							SetElementProperty(element, targetProperty, targetText);
							isAnimating = false;

							// Call callback props
							options.onAnimationCompleteDetailed?.({ animation: options.animation });
							options.onAnimationComplete?.(element);

							resolve();
						}
					} else {
						// Original mode: reveal original text
						const charsToReveal = Math.floor(progress * originalText.length);

						// Reveal characters in order
						for (let i = 0; i < charsToReveal; i++) {
							revealedChars[i] = true;
						}

						// Build display text, preserving newlines
						let newDisplayText = '';
						for (let i = 0; i < originalText.length; i++) {
							const char = originalText[i];
							if (char === '\n') {
								newDisplayText += '\n'; // Always preserve newlines
							} else if (revealedChars[i]) {
								newDisplayText += char;
							} else if (char === ' ') {
								newDisplayText += ' '; // Keep spaces as spaces
							} else {
								newDisplayText += GetRandomCharacter();
							}
						}

						SetElementProperty(element, targetProperty, newDisplayText);

						if (progress < 1) {
							setTimeout(animate, frameInterval);
						} else {
							// Animation complete
							SetElementProperty(element, targetProperty, originalText);
							isAnimating = false;

							// Call callback props
							options.onAnimationCompleteDetailed?.({ animation: options.animation });
							options.onAnimationComplete?.(element);

							resolve();
						}
					}
				}
			};

			animate();
		};

		if (showDuringDelay) {
			delayFrame();
		} else {
			startMainAnimation();
		}
	});

	return {
		promise,
		isAnimating: () => isAnimating,
		stop: () => {
			animationStopped = true;
			isAnimating = false;
			// When stopping, show the target text (newText if morphing, otherwise originalText)
			const finalText = options.newText && !isReverse ? options.newText : originalText;
			SetElementProperty(element, targetProperty, finalText);
			resolveAnimation?.();
		},
		restart: () => {
			if (isAnimating) {
				return;
			}
			ApplyCipherAnimation(element, originalText, options);
		},
	};
}

function ApplyGlitchAnimation(
	element: HTMLElement,
	options: AnimationOptions,
): AnimationController {
	// Apply CSS-based glitch animation
	const durationMs = ParseDuration(options.duration || 1000);
	const delayMs = ParseDuration(options.delay || 0);

	// Set CSS custom properties
	element.style.setProperty('--animation-duration', `${durationMs}ms`);
	element.style.setProperty('--animation-delay', `${delayMs}ms`);

	// Add glitch class
	element.classList.add('animate-glitch');

	let animationStopped = false;
	let resolveAnimation: (() => void) | null = null;

	const promise = new Promise<void>((resolve) => {
		resolveAnimation = resolve;

		// Call start callbacks
		options.onAnimationStartDetailed?.({ animation: options.animation });
		options.onAnimationStart?.();

		// For infinite animations, we don't auto-resolve
		// User can call stop() to end it
		if (element.style.animationIterationCount === 'infinite') {
			// Don't auto-resolve for infinite animations
			return;
		}

		// For finite animations, resolve after duration + delay
		setTimeout(() => {
			if (!animationStopped) {
				options.onAnimationCompleteDetailed?.({ animation: options.animation });
				options.onAnimationComplete?.(element);
				resolve();
			}
		}, durationMs + delayMs);
	});

	return {
		promise,
		isAnimating: () => element.classList.contains('animate-glitch'),
		stop: () => {
			animationStopped = true;
			element.classList.remove('animate-glitch');
			resolveAnimation?.();
		},
		restart: () => {
			element.classList.remove('animate-glitch');
			// Force reflow to restart animation
			element.offsetHeight;
			element.classList.add('animate-glitch');
		},
	};
}

/**
 * Apply text animation to any HTML element
 * @param element - The HTML element to animate
 * @param options - Animation configuration
 *   - For cipher animation with newText: morphs from current text to newText (only when reverse=false)
 *   - Length transitions are handled smoothly when newText length differs from current text
 *   - reachNewTextBeforeCipherUnscramble: if true, animates length to target first (50% of duration), then reveals characters (remaining 50%)
 * @returns Animation controller with promise and control methods
 */
export function AnimateText(element: HTMLElement, options: AnimationOptions): AnimationController {
	const targetProperty = options.property || 'textContent';
	const originalText = GetElementProperty(element, targetProperty);

	switch (options.animation) {
		case 'cipher':
			return ApplyCipherAnimation(element, originalText, options);
		case 'glitch':
			return ApplyGlitchAnimation(element, options);
		default:
			// No animation, just return a resolved promise
			return {
				promise: Promise.resolve(),
				isAnimating: () => false,
				stop: () => {},
				restart: () => {},
			};
	}
}

/**
 * Svelte action for easy use in Svelte components
 * Usage: <h1 use:textAnimation={{ animation: 'cipher', duration: '2s' }}>Text</h1>
 * For input elements: <input use:textAnimation={{ animation: 'cipher', property: 'value' }} />
 * For text morphing: <h1 use:textAnimation={{ animation: 'cipher', newText: 'New Content' }}>Old Content</h1>
 * For two-phase morphing: <h1 use:textAnimation={{ animation: 'cipher', newText: 'New Content', reachNewTextBeforeCipherUnscramble: true }}>Old Content</h1>
 */
export function TextAnimation(element: HTMLElement, options: AnimationOptions) {
	let controller: AnimationController;

	function startAnimation() {
		controller = AnimateText(element, options);
	}

	// Start animation when element is mounted
	startAnimation();

	return {
		update(newOptions: AnimationOptions) {
			// Stop current animation and start new one with updated options
			controller?.stop();
			controller = AnimateText(element, newOptions);
		},
		destroy() {
			controller?.stop();
		},
	};
}

// CSS for glitch animation - inject into document head
if (typeof document !== 'undefined') {
	const styleId = 'animate-text-styles';
	if (!document.getElementById(styleId)) {
		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
            .animate-glitch {
                animation: glitch var(--animation-duration, 1s) ease-in-out var(--animation-delay, 0s) infinite;
                transition: text-shadow 0.1s ease-in-out;
            }

            @keyframes glitch {
                0%, 100% {
                    text-shadow: 
                        0.05em 0 0 #ff0000,
                        -0.05em -0.025em 0 #00ff00,
                        0.025em 0.05em 0 #0000ff;
                }
                15% {
                    text-shadow: 
                        0.05em 0 0 #ff0000,
                        -0.05em -0.025em 0 #00ff00,
                        0.025em 0.05em 0 #0000ff;
                }
                16% {
                    text-shadow: 
                        -0.05em -0.025em 0 #ff0000,
                        0.025em 0.025em 0 #00ff00,
                        -0.05em -0.05em 0 #0000ff;
                }
                49% {
                    text-shadow: 
                        -0.05em -0.025em 0 #ff0000,
                        0.025em 0.025em 0 #00ff00,
                        -0.05em -0.05em 0 #0000ff;
                }
                50% {
                    text-shadow: 
                        0.025em 0.05em 0 #ff0000,
                        0.05em 0 0 #00ff00,
                        0 -0.05em 0 #0000ff;
                }
                99% {
                    text-shadow: 
                        0.025em 0.05em 0 #ff0000,
                        0.05em 0 0 #00ff00,
                        0 -0.05em 0 #0000ff;
                }
            }
        `;
		document.head.appendChild(style);
	}
}
