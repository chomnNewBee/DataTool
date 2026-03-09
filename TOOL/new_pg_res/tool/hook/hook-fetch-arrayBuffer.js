(function() {
    // 保存原始方法
    const originalArrayBuffer = Response.prototype.arrayBuffer;
    
    Response.prototype.arrayBuffer = function() {
        const url = this.url || 'unknown';
        
        console.groupCollapsed(`Intercepted arrayBuffer call for URL: ${url}`);
        console.trace('Call stack');
        console.groupEnd();
        
        // 调用原始方法获取Promise
        const arrayBufferPromise = originalArrayBuffer.call(this);
        
        // Hook这个Promise的then方法
        const originalThen = arrayBufferPromise.then;
        arrayBufferPromise.then = function(onFulfilled, onRejected) {
            console.groupCollapsed('Intercepted then call from arrayBuffer promise');
            console.trace('Promise then call stack');
            console.groupEnd();
            
            // 包装回调函数以拦截参数
            const wrappedOnFulfilled = onFulfilled && function(buffer) {
                console.group('ArrayBuffer data received');
                console.log('Buffer content:', buffer);
                console.log('Byte length:', buffer.byteLength);
                console.trace('Fulfilled call stack');
                console.groupEnd();
                
                return onFulfilled.apply(this, arguments);
            };
            
            const wrappedOnRejected = onRejected && function(reason) {
                console.group('ArrayBuffer failed');
                console.error('Error:', reason);
                console.trace('Rejected call stack');
                console.groupEnd();
                
                return onRejected.apply(this, arguments);
            };
            
            return originalThen.call(this, wrappedOnFulfilled, wrappedOnRejected);
        };
        
        return arrayBufferPromise;
    };
    
    console.log('Response.arrayBuffer and its then handler hooked with console.group');
})();