import Foundation
import Security

let provider = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "tenstorrent"
let services = ["tenstorrent": "blackblend.tenstorrent.console", "fal": "blackblend.fal.ai", "openai": "blackblend.openai"]
guard let service = services[provider] else { exit(1) }
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: "api-key"
]
func fail(_ status: OSStatus) -> Never {
    fputs("Keychain operation failed (\(status)).\n", stderr)
    exit(1)
}
let action = CommandLine.arguments[1]
if action == "set" {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty else { exit(1) }
    let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
        var add = query
        add[kSecValueData as String] = data
        let added = SecItemAdd(add as CFDictionary, nil)
        if added != errSecSuccess { fail(added) }
    } else if status != errSecSuccess { fail(status) }
} else if action == "has" {
    var read = query
    read[kSecReturnAttributes as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &result)
    if status != errSecSuccess && status != errSecItemNotFound { fail(status) }
    print(status == errSecSuccess ? "true" : "false")
} else if action == "get" {
    var read = query
    read[kSecReturnData as String] = true
    read[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(read as CFDictionary, &result)
    if status != errSecSuccess { fail(status) }
    guard let data = result as? Data else { exit(1) }
    FileHandle.standardOutput.write(data)
} else { exit(1) }
