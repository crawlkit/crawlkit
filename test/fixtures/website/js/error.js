window.setTimeout(function erroneousFunction() {
    throw new Error('Script error');
}, 2000);
