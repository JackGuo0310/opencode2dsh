//#region src/pool/rotate.ts
let delegate = null;
/** Install the runtime's rotate delegate (startIpPool). */
function setRotateDelegate(next) {
	delegate = next;
}
/** Ask the installed delegate; false when no pool is running. */
function shouldRotate(failure, model, session, attempt, deterministic = false) {
	return delegate?.decide(failure, model, session, attempt, deterministic) ?? false;
}
/** Map a pi-ai error message to the failure taxonomy (adapter-side parse). */
function classifyStreamFailure(errorMessage) {
	const text = errorMessage.toLowerCase();
	if (/\b429\b|rate.?limit|freeusagelimit/.test(text)) return "limited";
	if (/\b(?:401|403)\b/.test(text)) return "refused";
	if (/\b(?:network|connection|socket|fetch|terminated|premature close)\b|\beconn[a-z]+\b|timeout|timed out/.test(text)) return "transport";
	if (/\b5\d\d\b|internal server error|server error/.test(text)) return "transport";
	return null;
}
/** True when the error body names a deterministic region block (Zen's
*  RegionError): the exit's IP cannot serve this model — ban the pairing on
*  sight instead of collecting two samples (docs 4.2). */
function isRegionBlocked(errorMessage) {
	return /regionerror|not available in your country/i.test(errorMessage);
}
/**
* Build the runtime delegate over the live pool (ip-pool.ts assembly).
* Passive bookkeeping mirrors the dispatcher observer: the stream that died
* before content already recorded its verdict through the routing layer when
* it could see it — the sentinel covers the mute-connection case — so this
* delegate only breaks stickiness and checks whether a usable exit remains.
*/
function createRotateDelegate(pool, options = {}) {
	const maxAttempts = options.maxAttempts ?? 3;
	return { decide(failure, model, session, attempt, deterministic = false) {
		if (deterministic) {
			const failedExit = pool.exitOfSession(session);
			if (failedExit !== null) pool.markModelBanned(failedExit, model);
		}
		if (attempt > maxAttempts) return false;
		if (!pool.list().some((entry) => pool.isUsable(entry.id, model))) return false;
		pool.rerouteSession(session);
		return true;
	} };
}

//#endregion
export { shouldRotate as a, setRotateDelegate as i, createRotateDelegate as n, isRegionBlocked as r, classifyStreamFailure as t };