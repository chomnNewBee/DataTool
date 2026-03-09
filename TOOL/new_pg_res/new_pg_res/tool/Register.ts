class Register {
    private registerTable = new Map<string, any>()

    register(key: string, item: any) {
        let oldItem = this.registerTable.get(key)
        if (oldItem) {
            console.log(`不可重复注册:${key}`)
            return null
        }
        this.registerTable.set(key, item)
    }

    get(key: string) {
        let item = this.registerTable.get(key)
        if (!item) {
            console.log(`未注册:${key}`)
            return null
        }
        return item
    }

}

export default Register