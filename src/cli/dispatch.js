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
      return await runProjectScript('add-servlet.sh', args);
    case 'add-servlet':
      return await runProjectScript('add-servlet.sh', args);
    case 'clean':
      return await runClean();
    case 'status':
      return await showStatus();
    default:
      onUnknown(command);
      return;
  }
}

