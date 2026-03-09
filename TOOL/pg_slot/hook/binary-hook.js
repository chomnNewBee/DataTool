// 二进制数据读取 Hook - 同时监控 Fetch 和 XMLHttpRequest
(function () {
    'use strict';
    //   (func $send (;232;) (export "send") (pa
    const stack = console.stack || function () {
        const err = new Error();
        console.log(err.stack);
    }

    // Hook Fetch API
    if (window.fetch) {
        const originalFetch = window.fetch;
        window.fetch = function (...args) {
            console.log('🌐 [Fetch Hook] 请求:', args[0]);
            return originalFetch.apply(this, args)
                .then(response => {
                    console.log('📡 [Fetch Hook] 响应:', response.url, response.status);
                    return response;
                });
        };

        // Hook Response.prototype.arrayBuffer()
        const originalArrayBuffer = Response.prototype.arrayBuffer;
        Response.prototype.arrayBuffer = function () {
            console.log('📦 [Fetch ArrayBuffer Hook] .arrayBuffer() 被调用');
            console.log('   URL:', this.url);
            stack();
            return originalArrayBuffer.apply(this, arguments)
                .then(buffer => {
                    // 只监控小于等于 500 字节的 buffer
                    if (buffer.byteLength <= 500) {
                        console.log('✅ [Fetch ArrayBuffer Hook] 读取完成:', buffer.byteLength, 'bytes', buffer);
                        stack();
                        debugger;
                    }
                    return buffer;
                });
        };
    }

})();
