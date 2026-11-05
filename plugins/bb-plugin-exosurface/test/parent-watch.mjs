// Preloaded (node --import) into every fixture child a test spawns: the child ends once the test process that spawned it
// is gone, even when that process was SIGKILLed and none of its exit handlers ran. An orphan is re-parented, so its ppid
// changes. SIGTERM first, so the release owner stops its own Pi children; SIGKILL if it is still alive 5 s later.
const parent = process.ppid;
const watch = setInterval(() => {
  if (process.ppid === parent) return;
  clearInterval(watch); process.kill(process.pid, 'SIGTERM');
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 5000).unref();
}, 250);
watch.unref();
