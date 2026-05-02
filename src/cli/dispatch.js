export async function dispatchCommand(command, args, handlers) {
  const {
    main,
    showHelp,
    parseCliOptions,
    runProjectScript,
    runMigrate,
    runClean,
    showStatus,
    onUnknown
  } = handlers;

  const normalizeServletArgs = (rawArgs = []) => {
    if (rawArgs.length === 0) return rawArgs;
    const [rawName, ...rest] = rawArgs;
    const trimmed = String(rawName || '').trim();
    if (!trimmed) return rawArgs;
    const pascal = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    const lower = pascal.toLowerCase();
    const hasServletAtEdge = (lower.startsWith('servlet') || lower.endsWith('servlet')) && lower !== 'servlet';
    const normalized = hasServletAtEdge ? pascal : `${pascal}Servlet`;
    return [normalized, ...rest];
  };

  if (!command || command === 'create' || command === 'new') {
    return await main();
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  switch (command) {
    case 'dev': {
      const parsed = parseCliOptions(args);
      return await runProjectScript('dev.sh', parsed.scriptArgs, {
        verbose: parsed.verbose
      });
    }
    case 'build':
      return await runProjectScript('build.sh', args);
    case 'deploy':
      return await runProjectScript('deploy.sh', args);
    case 'migrate':
      return await runMigrate();
    case 'watch':
      return await runProjectScript('watch.sh', args);
    case 'servlet':
      return await runProjectScript('add-servlet.sh', normalizeServletArgs(args));
    case 'clean':
      return await runClean();
    case 'status':
      return await showStatus();
    default:
      onUnknown(command);
      return;
  }
}

