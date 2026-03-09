(function () {
    /**
     * Hook 第一层所有子对象的 decode 方法
     * @param {Object} rootObj - 需要 hook 的对象，结构为 { xxx: { decode } }
     */
    function hookAllDecode(rootObj) {
        Object.keys(rootObj).forEach(key => {
            const subObj = rootObj[key];
            console.log(`%c准备 hook: ${key}.decode`, 'color: orange;');
            if (subObj && subObj.decode) {
                const original = subObj.decode;
                console.log(`%c正在 hook: ${key}.decode`, 'color: orange;');
                subObj.decode = function (...args) {
                    const stack = new Error().stack.split('\n').slice(2, 5).map(s => s.trim());
                    console.group(`%c[HOOK] ${key}.decode`, 'color: #4CAF50; font-weight:bold;');
                    console.log('%c参数:', 'color: #2196F3;', args);
                    console.log('%c调用堆栈:', 'color: #9C27B0;', stack);
                    let result;
                    try {
                        result = original.apply(this, args);
                        console.log('%c返回值:', 'color: #FF9800;', result);
                    } catch (e) {
                        console.error('%c异常:', 'color: #F44336;', e);
                    }
                    console.groupEnd();
                    return result;
                };
                subObj.decode.__original = original;
                console.log(`%c已 hook: ${key}.decode`, 'color: green;');
            }
        });
        console.log('%c所有 decode 方法已 hook 完成！', 'color: #4CAF50; font-weight:bold;');
    }

    window.hookAllDecode = hookAllDecode;
    hookAllDecode(temp1);
    hookAllDecode(temp2);
})();
