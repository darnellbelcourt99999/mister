"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONBindingsBuilder = exports.isEntry = void 0;
const as_1 = require("visitor-as/as");
const visitor_as_1 = require("visitor-as");
const utils_1 = require("./utils");
const NEAR_DECORATOR = "nearBindgen";
function returnsVoid(node) {
    return utils_1.toString(node.signature.returnType) === "void";
}
function numOfParameters(node) {
    return node.signature.parameters.length;
}
function hasNearDecorator(stmt) {
    return ((stmt.text.includes("@nearfile") ||
        stmt.text.includes("@" + NEAR_DECORATOR) ||
        isEntry(stmt)) &&
        !stmt.text.includes("@notNearfile"));
}
function isEntry(source) {
    return source.range.source.sourceKind == as_1.SourceKind.USER_ENTRY;
}
exports.isEntry = isEntry;
function isClass(type) {
    return type.kind == as_1.NodeKind.CLASSDECLARATION;
}
function isField(mem) {
    return mem.kind == as_1.NodeKind.FIELDDECLARATION;
}
function isPayable(func) {
    return (func.decorators != null &&
        func.decorators.some((s) => utils_1.toString(s.name) != "payable"));
}
function createDecodeStatements(_class) {
    return _class.members
        .filter(isField)
        .map((field) => {
        const name = utils_1.toString(field.name);
        return (createDecodeStatement(field, `this.${name} = obj.has("${name}") ? `) +
            `: ${field.initializer != null
                ? utils_1.toString(field.initializer)
                : `this.${name}`};`);
    });
}
function createDecodeStatement(field, setterPrefix = "") {
    let T = utils_1.toString(field.type);
    let name = utils_1.toString(field.name);
    return `${setterPrefix}decode<${T}, JSON.Obj>(obj, "${name}")`;
}
function createEncodeStatements(_class) {
    return _class.members
        .filter(isField)
        .map((field) => {
        let T = utils_1.toString(field.type);
        let name = utils_1.toString(field.name);
        return `encode<${T}, JSONEncoder>(this.${name}, "${name}", encoder);`;
    });
}
// TODO: Extract this into separate module, preferrable pluggable
class JSONBindingsBuilder extends visitor_as_1.BaseVisitor {
    constructor() {
        super(...arguments);
        this.sb = [];
        this.exportedClasses = new Map();
        this.wrappedFuncs = new Set();
    }
    static build(source) {
        return new JSONBindingsBuilder().build(source);
    }
    static nearFiles(sources) {
        return sources.filter(hasNearDecorator);
    }
    visitClassDeclaration(node) {
        if (!this.exportedClasses.has(utils_1.toString(node.name))) {
            this.exportedClasses.set(utils_1.toString(node.name), node);
        }
        super.visitClassDeclaration(node);
    }
    visitFunctionDeclaration(node) {
        if (!isEntry(node) ||
            this.wrappedFuncs.has(utils_1.toString(node.name)) ||
            !node.is(as_1.CommonFlags.EXPORT) ||
            (numOfParameters(node) == 0 && returnsVoid(node))) {
            super.visitFunctionDeclaration(node);
            return;
        }
        this.generateWrapperFunction(node);
        // Change function to not be an export
        node.flags = node.flags ^ as_1.CommonFlags.EXPORT;
        this.wrappedFuncs.add(utils_1.toString(node.name));
        super.visit(node);
    }
    /*
    Create a wrapper function that will be export in the function's place.
    */
    generateWrapperFunction(func) {
        let signature = func.signature;
        let params = signature.parameters;
        let returnType = signature.returnType;
        let returnTypeName = utils_1.toString(returnType)
            .split("|")
            .map((name) => name.trim())
            .filter((name) => name !== "null")
            .join("|");
        let hasNull = utils_1.toString(returnType).includes("null");
        let name = func.name.text;
        this.sb.push(`function __wrapper_${name}(): void {`);
        if (params.length > 0) {
            this.sb.push(`  const obj = getInput();`);
        }
        if (utils_1.toString(returnType) !== "void") {
            this.sb.push(`  let result: ${utils_1.toString(returnType)} = ${name}(`);
        }
        else {
            this.sb.push(`  ${name}(`);
        }
        if (params.length > 0) {
            this.sb[this.sb.length - 1] += params
                .map((param) => {
                let name = utils_1.toString(param.name);
                let type = utils_1.toString(param.type);
                let res = `obj.has('${name}') ? 
             ${createDecodeStatement(param)} : 
             assertNonNull<${type}>('${name}', <${type}>${param.initializer ? utils_1.toString(param.initializer) : "null"})`;
                return res;
            })
                .join(", ");
        }
        this.sb[this.sb.length - 1] += ");";
        if (utils_1.toString(returnType) !== "void") {
            this.sb.push(`  const val = encode<${returnTypeName}>(${hasNull ? `changetype<${returnTypeName}>(result)` : "result"});
  value_return(val.byteLength, val.dataStart);`);
        }
        this.sb.push(`}
export { __wrapper_${name} as ${name} }`);
    }
    typeName(type) {
        if (!isClass(type)) {
            return utils_1.toString(type);
        }
        type = type;
        let className = utils_1.toString(type.name);
        if (type.isGeneric) {
            className += "<" + type.typeParameters.map(utils_1.toString).join(", ") + ">";
        }
        return className;
    }
    build(source) {
        const isNearFile = source.text.includes("@nearfile");
        this.sb = [];
        this.visit(source);
        let sourceText = source.statements.map((stmt) => {
            let str;
            if (isClass(stmt) &&
                (visitor_as_1.utils.hasDecorator(stmt, NEAR_DECORATOR) ||
                    isNearFile)) {
                let _class = stmt;
                let fields = _class.members
                    .filter(isField)
                    .map((field) => field);
                if (fields.some((field) => field.type == null)) {
                    throw new Error("All Fields must have explict type declaration.");
                }
                fields.forEach((field) => {
                    if (field.initializer == null) {
                        field.initializer = utils_1.SimpleParser.parseExpression(`defaultValue<${utils_1.toString(field.type)}>())`);
                    }
                });
                str = utils_1.toString(stmt);
                str = str.slice(0, str.lastIndexOf("}"));
                let className = this.typeName(_class);
                if (!visitor_as_1.utils.hasDecorator(stmt, NEAR_DECORATOR)) {
                    console.error("\x1b[31m", `@nearfile is deprecated use @${NEAR_DECORATOR} decorator on ${className}`, "\x1b[0m");
                }
                str += `
  decode<_V = Uint8Array>(buf: _V): ${className} {
    let json: JSON.Obj;
    if (buf instanceof Uint8Array) {
      json = JSON.parse(buf);
    } else {
      assert(buf instanceof JSON.Obj, "argument must be Uint8Array or Json Object");
      json = <JSON.Obj> buf;
    }
    return this._decode(json);
  }

  static decode(buf: Uint8Array): ${className} {
    return decode<${className}>(buf);
  }

  private _decode(obj: JSON.Obj): ${className} {
    ${createDecodeStatements(_class).join("\n    ")}
    return this;
  }

  _encode(name: string | null = "", _encoder: JSONEncoder | null = null): JSONEncoder {
    let encoder = _encoder == null ? new JSONEncoder() : _encoder;
    encoder.pushObject(name);
    ${createEncodeStatements(_class).join("\n    ")}
    encoder.popObject();
    return encoder;
  }
  encode(): Uint8Array {
    return this._encode().serialize();
  }

  serialize(): Uint8Array {
    return this.encode();
  }

  toJSON(): string {
    return this._encode().toString();
  }
}`;
            }
            else {
                str = utils_1.toString(stmt);
            }
            return str;
        });
        return sourceText.concat(this.sb).join("\n");
    }
}
exports.JSONBindingsBuilder = JSONBindingsBuilder;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiSlNPTkJ1aWxkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvSlNPTkJ1aWxkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsc0NBYXVCO0FBQ3ZCLDJDQUFnRDtBQUNoRCxtQ0FBaUQ7QUFFakQsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDO0FBRXJDLFNBQVMsV0FBVyxDQUFDLElBQXlCO0lBQzVDLE9BQU8sZ0JBQVEsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxLQUFLLE1BQU0sQ0FBQztBQUN4RCxDQUFDO0FBRUQsU0FBUyxlQUFlLENBQUMsSUFBeUI7SUFDaEQsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUM7QUFDMUMsQ0FBQztBQUVELFNBQVMsZ0JBQWdCLENBQUMsSUFBWTtJQUNwQyxPQUFPLENBQ0wsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7UUFDOUIsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsR0FBRyxHQUFHLGNBQWMsQ0FBQztRQUN4QyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDaEIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxjQUFjLENBQUMsQ0FDcEMsQ0FBQztBQUNKLENBQUM7QUFFRCxTQUFnQixPQUFPLENBQUMsTUFBcUI7SUFDM0MsT0FBTyxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxVQUFVLElBQUksZUFBVSxDQUFDLFVBQVUsQ0FBQztBQUNqRSxDQUFDO0FBRkQsMEJBRUM7QUFFRCxTQUFTLE9BQU8sQ0FBQyxJQUFVO0lBQ3pCLE9BQU8sSUFBSSxDQUFDLElBQUksSUFBSSxhQUFRLENBQUMsZ0JBQWdCLENBQUM7QUFDaEQsQ0FBQztBQUVELFNBQVMsT0FBTyxDQUFDLEdBQXlCO0lBQ3hDLE9BQU8sR0FBRyxDQUFDLElBQUksSUFBSSxhQUFRLENBQUMs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QUFDLEVBQUUsR0FBRyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2dCQUN6QyxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUN0QyxJQUFJLENBQUMsa0JBQUssQ0FBQyxZQUFZLENBQW1CLElBQUksRUFBRSxjQUFjLENBQUMsRUFBRTtvQkFDL0QsT0FBTyxDQUFDLEtBQUssQ0FDWCxVQUFVLEVBQ1YsZ0NBQWdDLGNBQWMsaUJBQWlCLFNBQVMsRUFBRSxFQUMxRSxTQUFTLENBQ1YsQ0FBQztpQkFDSDtnQkFDRCxHQUFHLElBQUk7c0NBQ3VCLFNBQVM7Ozs7Ozs7Ozs7O29DQVdYLFNBQVM7b0JBQ3pCLFNBQVM7OztvQ0FHTyxTQUFTO01BQ3ZDLHNCQUFzQixDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUM7Ozs7Ozs7TUFPN0Msc0JBQXNCLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQzs7Ozs7Ozs7Ozs7Ozs7O0VBZWpELENBQUM7YUFDSTtpQkFBTTtnQkFDTCxHQUFHLEdBQUcsZ0JBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUN0QjtZQUNELE9BQU8sR0FBRyxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUMvQyxDQUFDO0NBQ0Y7QUFyTEQsa0RBcUxDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgTm9kZSxcbiAgRnVuY3Rpb25EZWNsYXJhdGlvbixcbiAgTm9kZUtpbmQsXG4gIFNvdXJjZSxcbiAgU291cmNlS2luZCxcbiAgVHlwZU5vZGUsXG4gIENsYXNzRGVjbGFyYXRpb24sXG4gIERlY2xhcmF0aW9uU3RhdGVtZW50LFxuICBDb21tb25GbGFncyxcbiAgRmllbGREZWNsYXJhdGlvbixcbiAgUGFyYW1ldGVyTm9kZSxcbiAgQmxvY2tTdGF0ZW1lbnQsXG59IGZyb20gXCJ2aXNpdG9yLWFzL2FzXCI7XG5pbXBvcnQgeyBCYXNlVmlzaXRvciwgdXRpbHMgfSBmcm9tIFwidmlzaXRvci1hc1wiO1xuaW1wb3J0IHsgU2ltcGxlUGFyc2VyLCB0b1N0cmluZyB9IGZyb20gXCIuL3V0aWxzXCI7XG5cbmNvbnN0IE5FQVJfREVDT1JBVE9SID0gXCJuZWFyQmluZGdlblwiO1xuXG5mdW5jdGlvbiByZXR1cm5zVm9pZChub2RlOiBGdW5jdGlvbkRlY2xhcmF0aW9uKTogYm9vbGVhbiB7XG4gIHJldHVybiB0b1N0cmluZyhub2RlLnNpZ25hdHVyZS5yZXR1cm5UeXBlKSA9PT0gXCJ2b2lkXCI7XG59XG5cbmZ1bmN0aW9uIG51bU9mUGFyYW1ldGVycyhub2RlOiBGdW5jdGlvbkRlY2xhcmF0aW9uKTogbnVtYmVyIHtcbiAgcmV0dXJuIG5vZGUuc2lnbmF0dXJlLnBhcmFtZXRlcnMubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBoYXNOZWFyRGVjb3JhdG9yKHN0bXQ6IFNvdXJjZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIChzdG10LnRleHQuaW5jbHVkZXMoXCJAbmVhcmZpbGVcIikgfHxcbiAgICAgIHN0bXQudGV4dC5pbmNsdWRlcyhcIkBcIiArIE5FQVJfREVDT1JBVE9SKSB8fFxuICAgICAgaXNFbnRyeShzdG10KSkgJiZcbiAgICAhc3RtdC50ZXh0LmluY2x1ZGVzKFwiQG5vdE5lYXJmaWxlXCIpXG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc0VudHJ5KHNvdXJjZTogU291cmNlIHwgTm9kZSk6IGJvb2xlYW4ge1xuICByZXR1cm4gc291cmNlLnJhbmdlLnNvdXJjZS5zb3VyY2VLaW5kID09IFNvdXJjZUtpbmQuVVNFUl9FTlRSWTtcbn1cblxuZnVuY3Rpb24gaXNDbGFzcyh0eXBlOiBOb2RlKTogYm9vbGVhbiB7XG4gIHJldHVybiB0eXBlLmtpbmQgPT0gTm9kZUtpbmQuQ0xBU1NERUNMQVJBVElPTjtcbn1cblxuZnVuY3Rpb24gaXNGaWVsZChtZW06IERlY2xhcmF0aW9uU3RhdGVtZW50KSB7XG4gIHJldHVybiBtZW0ua2luZCA9PSBOb2RlS2luZC5GSUVMRERFQ0xBUkFUSU9OO1xufVxuXG5mdW5jdGlvbiBpc1BheWFibGUoZnVuYzogRnVuY3Rpb25EZWNsYXJhdGlvbik6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgIGZ1bmMuZGVjb3JhdG9ycyAhPSBudWxsICYmXG4gICAgZnVuYy5kZWNvcmF0b3JzLnNvbWUoKHMpID0+IHRvU3RyaW5nKHMubmFtZSkgIT0gXCJwYXlhYmxlXCIpXG4gICk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURlY29kZVN0YXRlbWVudHMoX2NsYXNzOiBDbGFzc0RlY2xhcmF0aW9uKTogc3RyaW5nW10ge1xuICByZXR1cm4gX2NsYXNzLm1lbWJlcnNcbiAgICAuZmlsdGVyKGlzRmllbGQpXG4gICAgLm1hcCgoZmllbGQ6IEZpZWxkRGVjbGFyYXRpb24pOiBzdHJpbmcgPT4ge1xuICAgICAgY29uc3QgbmFtZSA9IHRvU3RyaW5nKGZpZWxkLm5hbWUpO1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgY3JlYXRlRGVjb2RlU3RhdGVtZW50KGZpZWxkLCBgdGhpcy4ke25hbWV9ID0gb2JqLmhhcyhcIiR7bmFtZX1cIikgPyBgKSArXG4gICAgICAgIGA6ICR7XG4gICAgICAgICAgZmllbGQuaW5pdGlhbGl6ZXIgIT0gbnVsbFxuICAgICAgICAgICAgPyB0b1N0cmluZyhmaWVsZC5pbml0aWFsaXplcilcbiAgICAgICAgICAgIDogYHRoaXMuJHtuYW1lfWBcbiAgICAgICAgfTtgXG4gICAgICApO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVEZWNvZGVTdGF0ZW1lbnQoXG4gIGZpZWxkOiBGaWVsZERlY2xhcmF0aW9uIHwgUGFyYW1ldGVyTm9kZSxcbiAgc2V0dGVyUHJlZml4OiBzdHJpbmcgPSBcIlwiXG4pOiBzdHJpbmcge1xuICBsZXQgVCA9IHRvU3RyaW5nKGZpZWxkLnR5cGUhKTtcbiAgbGV0IG5hbWUgPSB0b1N0cmluZyhmaWVsZC5uYW1lKTtcbiAgcmV0dXJuIGAke3NldHRlclByZWZpeH1kZWNvZGU8JHtUfSwgSlNPTi5PYmo+KG9iaiwgXCIke25hbWV9XCIpYDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRW5jb2RlU3RhdGVtZW50cyhfY2xhc3M6IENsYXNzRGVjbGFyYXRpb24pOiBzdHJpbmdbXSB7XG4gIHJldHVybiBfY2xhc3MubWVtYmVyc1xuICAgIC5maWx0ZXIoaXNGaWVsZClcbiAgICAubWFwKChmaWVsZDogRmllbGREZWNsYXJhdGlvbik6IHN0cmluZyA9PiB7XG4gICAgICBsZXQgVCA9IHRvU3RyaW5nKGZpZWxkLnR5cGUhKTtcbiAgICAgIGxldCBuYW1lID0gdG9TdHJpbmcoZmllbGQubmFtZSk7XG4gICAgICByZXR1cm4gYGVuY29kZTwke1R9LCBKU09ORW5jb2Rlcj4odGhpcy4ke25hbWV9LCBcIiR7bmFtZX1cIiwgZW5jb2Rlcik7YDtcbiAgICB9KTtcbn1cblxuLy8gVE9ETzogRXh0cmFjdCB0aGlzIGludG8gc2VwYXJhdGUgbW9kdWxlLCBwcmVmZXJyYWJsZSBwbHVnZ2FibGVcbmV4cG9ydCBjbGFzcyBKU09OQmluZGluZ3NCdWlsZGVyIGV4dGVuZHMgQmFzZVZpc2l0b3Ige1xuICBwcml2YXRlIHNiOiBzdHJpbmdbXSA9IFtdO1xuICBwcml2YXRlIGV4cG9ydGVkQ2xhc3NlczogTWFwPHN0cmluZywgQ2xhc3NEZWNsYXJhdGlvbj4gPSBuZXcgTWFwKCk7XG4gIHdyYXBwZWRGdW5jczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cbiAgc3RhdGljIGJ1aWxkKHNvdXJjZTogU291cmNlKTogc3RyaW5nIHtcbiAgICByZXR1cm4gbmV3IEpTT05CaW5kaW5nc0J1aWxkZXIoKS5idWlsZChzb3VyY2UpO1xuICB9XG5cbiAgc3RhdGljIG5lYXJGaWxlcyhzb3VyY2VzOiBTb3VyY2VbXSk6IFNvdXJjZVtdIHtcbiAgICByZXR1cm4gc291cmNlcy5maWx0ZXIoaGFzTmVhckRlY29yYXRvcik7XG4gIH1cblxuICB2aXNpdENsYXNzRGVjbGFyYXRpb24obm9kZTogQ2xhc3NEZWNsYXJhdGlvbik6IHZvaWQge1xuICAgIGlmICghdGhpcy5leHBvcnRlZENsYXNzZXMuaGFzKHRvU3RyaW5nKG5vZGUubmFtZSkpKSB7XG4gICAgICB0aGlzLmV4cG9ydGVkQ2xhc3Nlcy5zZXQodG9TdHJpbmcobm9kZS5uYW1lKSwgbm9kZSk7XG4gICAgfVxuICAgIHN1cGVyLnZpc2l0Q2xhc3NEZWNsYXJhdGlvbihub2RlKTtcbiAgfVxuXG4gIHZpc2l0RnVuY3Rpb25EZWNsYXJhdGlvbihub2RlOiBGdW5jdGlvbkRlY2xhcmF0aW9uKTogdm9pZCB7XG4gICAgaWYgKFxuICAgICAgIWlzRW50cnkobm9kZSkgfHxcbiAgICAgIHRoaXMud3JhcHBlZEZ1bmNzLmhhcyh0b1N0cmluZyhub2RlLm5hbWUpKSB8fFxuICAgICAgIW5vZGUuaXMoQ29tbW9uRmxhZ3MuRVhQT1JUKSB8fFxuICAgICAgKG51bU9mUGFyYW1ldGVycyhub2RlKSA9PSAwICYmIHJldHVybnNWb2lkKG5vZGUpKVxuICAgICkge1xuICAgICAgc3VwZXIudmlzaXRGdW5jdGlvbkRlY2xhcmF0aW9uKG5vZGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmdlbmVyYXRlV3JhcHBlckZ1bmN0aW9uKG5vZGUpO1xuICAgIC8vIENoYW5nZSBmdW5jdGlvbiB0byBub3QgYmUgYW4gZXhwb3J0XG4gICAgbm9kZS5mbGFncyA9IG5vZGUuZmxhZ3MgXiBDb21tb25GbGFncy5FWFBPUlQ7XG4gICAgdGhpcy53cmFwcGVkRnVuY3MuYWRkKHRvU3RyaW5nKG5vZGUubmFtZSkpO1xuICAgIHN1cGVyLnZpc2l0KG5vZGUpO1xuICB9XG5cbiAgLypcbiAgQ3JlYXRlIGEgd3JhcHBlciBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgZXhwb3J0IGluIHRoZSBmdW5jdGlvbidzIHBsYWNlLlxuICAqL1xuICBwcml2YXRlIGdlbmVyYXRlV3JhcHBlckZ1bmN0aW9uKGZ1bmM6IEZ1bmN0aW9uRGVjbGFyYXRpb24pIHtcbiAgICBsZXQgc2lnbmF0dXJlID0gZnVuYy5zaWduYXR1cmU7XG4gICAgbGV0IHBhcmFtcyA9IHNpZ25hdHVyZS5wYXJhbWV0ZXJzO1xuICAgIGxldCByZXR1cm5UeXBlID0gc2lnbmF0dXJlLnJldHVyblR5cGU7XG4gICAgbGV0IHJldHVyblR5cGVOYW1lID0gdG9TdHJpbmcocmV0dXJuVHlwZSlcbiAgICAgIC5zcGxpdChcInxcIilcbiAgICAgIC5tYXAoKG5hbWUpID0+IG5hbWUudHJpbSgpKVxuICAgICAgLmZpbHRlcigobmFtZSkgPT4gbmFtZSAhPT0gXCJudWxsXCIpXG4gICAgICAuam9pbihcInxcIik7XG4gICAgbGV0IGhhc051bGwgPSB0b1N0cmluZyhyZXR1cm5UeXBlKS5pbmNsdWRlcyhcIm51bGxcIik7XG4gICAgbGV0IG5hbWUgPSBmdW5jLm5hbWUudGV4dDtcblxuICAgIHRoaXMuc2IucHVzaChgZnVuY3Rpb24gX193cmFwcGVyXyR7bmFtZX0oKTogdm9pZCB7YCk7XG4gICAgaWYgKHBhcmFtcy5sZW5ndGggPiAwKSB7XG4gICAgICB0aGlzLnNiLnB1c2goYCAgY29uc3Qgb2JqID0gZ2V0SW5wdXQoKTtgKTtcbiAgICB9XG4gICAgaWYgKHRvU3RyaW5nKHJldHVyblR5cGUpICE9PSBcInZvaWRcIikge1xuICAgICAgdGhpcy5zYi5wdXNoKGAgIGxldCByZXN1bHQ6ICR7dG9TdHJpbmcocmV0dXJuVHlwZSl9ID0gJHtuYW1lfShgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5zYi5wdXNoKGAgICR7bmFtZX0oYCk7XG4gICAgfVxuICAgIGlmIChwYXJhbXMubGVuZ3RoID4gMCkge1xuICAgICAgdGhpcy5zYlt0aGlzLnNiLmxlbmd0aCAtIDFdICs9IHBhcmFtc1xuICAgICAgICAubWFwKChwYXJhbSkgPT4ge1xuICAgICAgICAgIGxldCBuYW1lID0gdG9TdHJpbmcocGFyYW0ubmFtZSk7XG4gICAgICAgICAgbGV0IHR5cGUgPSB0b1N0cmluZyhwYXJhbS50eXBlKTtcbiAgICAgICAgICBsZXQgcmVzID0gYG9iai5oYXMoJyR7bmFtZX0nKSA/IFxuICAgICAgICAgICAgICR7Y3JlYXRlRGVjb2RlU3RhdGVtZW50KHBhcmFtKX0gOiBcbiAgICAgICAgICAgICBhc3NlcnROb25OdWxsPCR7dHlwZX0+KCcke25hbWV9JywgPCR7dHlwZX0+JHtcbiAgICAgICAgICAgIHBhcmFtLmluaXRpYWxpemVyID8gdG9TdHJpbmcocGFyYW0uaW5pdGlhbGl6ZXIpIDogXCJudWxsXCJcbiAgICAgICAgICB9KWA7XG4gICAgICAgICAgcmV0dXJuIHJlcztcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oXCIsIFwiKTtcbiAgICB9XG4gICAgdGhpcy5zYlt0aGlzLnNiLmxlbmd0aCAtIDFdICs9IFwiKTtcIjtcbiAgICBpZiAodG9TdHJpbmcocmV0dXJuVHlwZSkgIT09IFwidm9pZFwiKSB7XG4gICAgICB0aGlzLnNiLnB1c2goYCAgY29uc3QgdmFsID0gZW5jb2RlPCR7cmV0dXJuVHlwZU5hbWV9Pigke1xuICAgICAgICBoYXNOdWxsID8gYGNoYW5nZXR5cGU8JHtyZXR1cm5UeXBlTmFtZX0+KHJlc3VsdClgIDogXCJyZXN1bHRcIlxuICAgICAgfSk7XG4gIHZhbHVlX3JldHVybih2YWwuYnl0ZUxlbmd0aCwgdmFsLmRhdGFTdGFydCk7YCk7XG4gICAgfVxuICAgIHRoaXMuc2IucHVzaChgfVxuZXhwb3J0IHsgX193cmFwcGVyXyR7bmFtZX0gYXMgJHtuYW1lfSB9YCk7XG4gIH1cblxuICBwcml2YXRlIHR5cGVOYW1lKHR5cGU6IFR5cGVOb2RlIHwgQ2xhc3NEZWNsYXJhdGlvbik6IHN0cmluZyB7XG4gICAgaWYgKCFpc0NsYXNzKHR5cGUpKSB7XG4gICAgICByZXR1cm4gdG9TdHJpbmcodHlwZSk7XG4gICAgfVxuICAgIHR5cGUgPSA8Q2xhc3NEZWNsYXJhdGlvbj50eXBlO1xuICAgIGxldCBjbGFzc05hbWUgPSB0b1N0cmluZyh0eXBlLm5hbWUpO1xuICAgIGlmICh0eXBlLmlzR2VuZXJpYykge1xuICAgICAgY2xhc3NOYW1lICs9IFwiPFwiICsgdHlwZS50eXBlUGFyYW1ldGVycyEubWFwKHRvU3RyaW5nKS5qb2luKFwiLCBcIikgKyBcIj5cIjtcbiAgICB9XG4gICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgfVxuXG4gIGJ1aWxkKHNvdXJjZTogU291cmNlKTogc3RyaW5nIHtcbiAgICBjb25zdCBpc05lYXJGaWxlID0gc291cmNlLnRleHQuaW5jbHVkZXMoXCJAbmVhcmZpbGVcIik7XG4gICAgdGhpcy5zYiA9IFtdO1xuICAgIHRoaXMudmlzaXQoc291cmNlKTtcblxuICAgIGxldCBzb3VyY2VUZXh0ID0gc291cmNlLnN0YXRlbWVudHMubWFwKChzdG10KSA9PiB7XG4gICAgICBsZXQgc3RyO1xuICAgICAgaWYgKFxuICAgICAgICBpc0NsYXNzKHN0bXQpICYmXG4gICAgICAgICh1dGlscy5oYXNEZWNvcmF0b3IoPENsYXNzRGVjbGFyYXRpb24+c3RtdCwgTkVBUl9ERUNPUkFUT1IpIHx8XG4gICAgICAgICAgaXNOZWFyRmlsZSlcbiAgICAgICkge1xuICAgICAgICBsZXQgX2NsYXNzID0gPENsYXNzRGVjbGFyYXRpb24+c3RtdDtcbiAgICAgICAgbGV0IGZpZWxkcyA9IF9jbGFzcy5tZW1iZXJzXG4gICAgICAgICAgLmZpbHRlcihpc0ZpZWxkKVxuICAgICAgICAgIC5tYXAoKGZpZWxkOiBGaWVsZERlY2xhcmF0aW9uKSA9PiBmaWVsZCk7XG4gICAgICAgIGlmIChmaWVsZHMuc29tZSgoZmllbGQpID0+IGZpZWxkLnR5cGUgPT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBbGwgRmllbGRzIG11c3QgaGF2ZSBleHBsaWN0IHR5cGUgZGVjbGFyYXRpb24uXCIpO1xuICAgICAgICB9XG4gICAgICAgIGZpZWxkcy5mb3JFYWNoKChmaWVsZCkgPT4ge1xuICAgICAgICAgIGlmIChmaWVsZC5pbml0aWFsaXplciA9PSBudWxsKSB7XG4gICAgICAgICAgICBmaWVsZC5pbml0aWFsaXplciA9IFNpbXBsZVBhcnNlci5wYXJzZUV4cHJlc3Npb24oXG4gICAgICAgICAgICAgIGBkZWZhdWx0VmFsdWU8JHt0b1N0cmluZyhmaWVsZC50eXBlISl9PigpKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgc3RyID0gdG9TdHJpbmcoc3RtdCk7XG4gICAgICAgIHN0ciA9IHN0ci5zbGljZSgwLCBzdHIubGFzdEluZGV4T2YoXCJ9XCIpKTtcbiAgICAgICAgbGV0IGNsYXNzTmFtZSA9IHRoaXMudHlwZU5hbWUoX2NsYXNzKTtcbiAgICAgICAgaWYgKCF1dGlscy5oYXNEZWNvcmF0b3IoPENsYXNzRGVjbGFyYXRpb24+c3RtdCwgTkVBUl9ERUNPUkFUT1IpKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgIFwiXFx4MWJbMzFtXCIsXG4gICAgICAgICAgICBgQG5lYXJmaWxlIGlzIGRlcHJlY2F0ZWQgdXNlIEAke05FQVJfREVDT1JBVE9SfSBkZWNvcmF0b3Igb24gJHtjbGFzc05hbWV9YCxcbiAgICAgICAgICAgIFwiXFx4MWJbMG1cIlxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgc3RyICs9IGBcbiAgZGVjb2RlPF9WID0gVWludDhBcnJheT4oYnVmOiBfVik6ICR7Y2xhc3NOYW1lfSB7XG4gICAgbGV0IGpzb246IEpTT04uT2JqO1xuICAgIGlmIChidWYgaW5zdGFuY2VvZiBVaW50OEFycmF5KSB7XG4gICAgICBqc29uID0gSlNPTi5wYXJzZShidWYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhc3NlcnQoYnVmIGluc3RhbmNlb2YgSlNPTi5PYmosIFwiYXJndW1lbnQgbXVzdCBiZSBVaW50OEFycmF5IG9yIEpzb24gT2JqZWN0XCIpO1xuICAgICAganNvbiA9IDxKU09OLk9iaj4gYnVmO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fZGVjb2RlKGpzb24pO1xuICB9XG5cbiAgc3RhdGljIGRlY29kZShidWY6IFVpbnQ4QXJyYXkpOiAke2NsYXNzTmFtZX0ge1xuICAgIHJldHVybiBkZWNvZGU8JHtjbGFzc05hbWV9PihidWYpO1xuICB9XG5cbiAgcHJpdmF0ZSBfZGVjb2RlKG9iajogSlNPTi5PYmopOiAke2NsYXNzTmFtZX0ge1xuICAgICR7Y3JlYXRlRGVjb2RlU3RhdGVtZW50cyhfY2xhc3MpLmpvaW4oXCJcXG4gICAgXCIpfVxuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgX2VuY29kZShuYW1lOiBzdHJpbmcgfCBudWxsID0gXCJcIiwgX2VuY29kZXI6IEpTT05FbmNvZGVyIHwgbnVsbCA9IG51bGwpOiBKU09ORW5jb2RlciB7XG4gICAgbGV0IGVuY29kZXIgPSBfZW5jb2RlciA9PSBudWxsID8gbmV3IEpTT05FbmNvZGVyKCkgOiBfZW5jb2RlcjtcbiAgICBlbmNvZGVyLnB1c2hPYmplY3QobmFtZSk7XG4gICAgJHtjcmVhdGVFbmNvZGVTdGF0ZW1lbnRzKF9jbGFzcykuam9pbihcIlxcbiAgICBcIil9XG4gICAgZW5jb2Rlci5wb3BPYmplY3QoKTtcbiAgICByZXR1cm4gZW5jb2RlcjtcbiAgfVxuICBlbmNvZGUoKTogVWludDhBcnJheSB7XG4gICAgcmV0dXJuIHRoaXMuX2VuY29kZSgpLnNlcmlhbGl6ZSgpO1xuICB9XG5cbiAgc2VyaWFsaXplKCk6IFVpbnQ4QXJyYXkge1xuICAgIHJldHVybiB0aGlzLmVuY29kZSgpO1xuICB9XG5cbiAgdG9KU09OKCk6IHN0cmluZyB7XG4gICAgcmV0dXJuIHRoaXMuX2VuY29kZSgpLnRvU3RyaW5nKCk7XG4gIH1cbn1gO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gdG9TdHJpbmcoc3RtdCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH0pO1xuICAgIHJldHVybiBzb3VyY2VUZXh0LmNvbmNhdCh0aGlzLnNiKS5qb2luKFwiXFxuXCIpO1xuICB9XG59XG4iXX0=