let installed = false;

export function installAbortSignalTimeoutReasonListener(): void {
	if (installed) {
		return;
	}
	installed = true;

	const originalAbortSignalTimeout = AbortSignal.timeout.bind(AbortSignal);

	AbortSignal.timeout = ((delay: number) => {
		const signal = originalAbortSignalTimeout(delay);
		signal.addEventListener("abort", () => {
			void signal.reason;
		}, { once: true });
		return signal;
	}) as typeof AbortSignal.timeout;
}
