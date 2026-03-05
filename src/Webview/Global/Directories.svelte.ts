export const directories = $state({
	//Populated dynamically once we have access to communicate with VSCode.
	//This will be a URI pointing to `imagery/` that we can use within
	//Svelte to comply with the established CSP rules and load items in
	//a 'secure' manner.
	imagery: '',
});
